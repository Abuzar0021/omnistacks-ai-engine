# API conventions

Rules for every endpoint in `apps/api`. The businesses module (M1) implements this
contract in full; the [endpoint reference](#endpoint-reference) at the bottom lists what
exists today.

## Basics

- Base path: **`/api`** (nginx and the Vite dev server proxy this prefix).
- JSON in, JSON out (`Content-Type: application/json`). Request bodies over 1 MB are
  rejected (configured in `app.ts`).
- Resource names: plural, kebab-case for multi-word (`/api/campaigns`,
  `/api/scrape-jobs`).
- Nesting at most one level deep for ownership (`/api/campaigns/:id/leads`); everything
  else is filtered top-level collections.
- IDs are cuids (opaque strings) — clients must not parse them.

## Methods & status codes

| Operation         | Method/Path                     | Success                     |
| ----------------- | ------------------------------- | --------------------------- |
| List              | `GET /api/leads`                | `200` + collection envelope |
| Get one           | `GET /api/leads/:id`            | `200`                       |
| Create            | `POST /api/leads`               | `201` + created resource    |
| Partial update    | `PATCH /api/leads/:id`          | `200` + updated resource    |
| Delete/archive    | `DELETE /api/leads/:id`         | `204`                       |
| Action (non-CRUD) | `POST /api/campaigns/:id/start` | `200`/`202`                 |

Long-running operations return `202 Accepted` with the created job:
`{ "data": { "jobId": "..." } }` — poll `GET /api/jobs/:id`.

## Response envelopes

**Single resource:**

```json
{ "data": { "id": "cl...", "name": "Q3 SaaS founders" } }
```

**Collections** (always paginated, offset-based — list views need total counts, and
offset pagination composes with arbitrary sorting):

```json
{
  "data": [{ "id": "cl..." }],
  "pagination": { "page": 1, "limit": 25, "total": 132, "totalPages": 6 }
}
```

Query parameters: `page` (default 1), `limit` (default 25, max 200), plus documented
per-resource filters (`?status=CLIENT`) and sorting (`?sort=-createdAt`; `-` prefix =
descending). If deep pagination over very large collections ever becomes a hot path,
cursor pagination can be added per-resource without breaking this shape.

## Error responses

All errors use one shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "email", "message": "Invalid email" }]
  }
}
```

- `code` is a stable SCREAMING_SNAKE machine-readable identifier — clients switch on it,
  never on `message`.
- `details` is optional; present for validation errors (one entry per failed field).
- Internal errors never leak stack traces or driver messages to clients; the full error is
  logged server-side with the request ID.

| HTTP | `code`             | When                                                      |
| ---- | ------------------ | --------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` | Zod parse failure on body/query/params                    |
| 401  | `UNAUTHENTICATED`  | Missing/invalid/expired token                             |
| 403  | `FORBIDDEN`        | Valid token, insufficient role or not the owner           |
| 404  | `NOT_FOUND`        | Unknown route or resource                                 |
| 409  | `CONFLICT`         | Unique constraint (e.g. duplicate email)                  |
| 422  | `UNPROCESSABLE`    | Semantically invalid (e.g. starting an archived campaign) |
| 429  | `RATE_LIMITED`     | Rate limit exceeded (includes `Retry-After` header, M8)   |
| 500  | `INTERNAL`         | Anything unhandled                                        |

This envelope is implemented in `middleware/error-handler.ts`, which maps Zod parse
failures, typed `AppError`s thrown by services, malformed bodies, and stray Prisma
constraint errors to the table above.

## Validation rules

- Every route validates **body, query, and params with Zod** before touching services.
  Handlers only ever see parsed, typed data.
- Schemas live next to the route in the feature module
  (`modules/<feature>/<feature>.schemas.ts`) so they can be unit-tested and reused.
- Unknown body fields are rejected (`.strict()`) — catches client typos early.
- Validation failures short-circuit to `400 VALIDATION_ERROR` with per-field `details`.
- Env-dependent limits (page size, import size) come from config, not literals.

## Authentication strategy

JWT bearer tokens (implemented in M1 — see [ROADMAP.md](ROADMAP.md)):

- `POST /api/auth/register`, `POST /api/auth/login` → short-lived **access token**
  (~15 min, signed with `JWT_SECRET`) + long-lived **refresh token** (~30 days, rotated on
  use via `POST /api/auth/refresh`).
- Clients send `Authorization: Bearer <access-token>`.
- Roles: `ADMIN` (all resources) and `MEMBER` (own campaigns only) — enforced by
  middleware; ownership checks happen in services, not routes.
- Passwords hashed with argon2id. Never logged, never returned.
- **Webhook auth** (n8n → API): shared-secret header (`X-Webhook-Secret`), constant-time
  comparison. Webhook routes are outside the JWT middleware. See [N8N.md](N8N.md).
- Health endpoints (`/api/health/*`) are always unauthenticated.

## Versioning

- The API is unversioned-by-URL for now: `/api/...` is implicitly **v1**. Internal
  clients (web app, n8n) deploy together with the API, so URL versioning would be
  ceremony without benefit.
- **Additive changes** (new fields, new endpoints, new optional params) are not versions —
  clients must tolerate unknown fields.
- **Breaking changes** (removing/renaming fields, changing semantics) require introducing
  `/api/v2/...` for the affected resource and keeping v1 responses stable for one
  deprecation cycle. Announce in the changelog; document in this file.
- The first external/public API consumer triggers formalizing `/api/v1` across the board.

## Endpoint reference

> Auth is "none" everywhere until M2 lands; these endpoints will then require a bearer
> token per the strategy above.

### Health

| Endpoint                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `GET /api/health`       | Service identity + timestamp                          |
| `GET /api/health/live`  | Liveness (process up) — used by Docker healthcheck    |
| `GET /api/health/ready` | Readiness (DB reachable via `SELECT 1`); `503` if not |

### Businesses

| Endpoint                      | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/businesses`         | List with pagination, sorting, filtering, search (params below)                |
| `GET /api/businesses/:id`     | Fetch one (404 if unknown)                                                     |
| `POST /api/businesses`        | Create; `201`; `409 CONFLICT` on duplicate normalized domain                   |
| `PATCH /api/businesses/:id`   | Partial update; only provided fields change; `website: null` clears the domain |
| `DELETE /api/businesses/:id`  | Delete; `204`                                                                  |
| `POST /api/businesses/import` | CSV import (`Content-Type: text/csv`, max 10 MB / 5000 rows)                   |

**List query parameters** — `page`, `limit`, `sort`
(`name`/`createdAt`/`updatedAt`/`status`, `-` prefix for descending; default
`-createdAt`), `status` (exact enum value), `industry` and `country`
(case-insensitive exact), `tag` (case-insensitive tag name), `q` (case-insensitive
substring across name, domain, email, city).

**Business shape** — all business responses flatten tags to names:

```json
{
  "data": {
    "id": "cmr...",
    "name": "Acme Corp",
    "website": "https://www.acme.com/about",
    "domain": "acme.com",
    "email": "info@acme.com",
    "phone": null,
    "industry": "SaaS",
    "country": "USA",
    "city": "New York",
    "status": "NEW",
    "notes": null,
    "tags": ["priority", "saas"],
    "createdAt": "2026-07-03T09:25:40.145Z",
    "updatedAt": "2026-07-03T09:25:40.145Z"
  }
}
```

Create/update accept the same fields plus `tags` (array of names, created on demand);
`domain` is always derived server-side from `website` — it cannot be set directly.

**CSV import** — expected header (any order, case-insensitive, unknown columns
ignored; only `name` required):

```
name,website,email,phone,industry,country,city,status,notes
```

Rows with an invalid email/website/status are rejected individually; duplicate domains
(within the file or already in the database) are skipped. The response is a summary:

```json
{
  "data": {
    "totalRows": 6,
    "imported": 2,
    "skipped": 4,
    "errors": [{ "row": 3, "field": "email", "message": "Invalid email" }],
    "duplicates": [{ "row": 5, "domain": "acme.com", "reason": "duplicate_in_file" }]
  }
}
```

`row` is the 1-based CSV line number (the header is line 1). `reason` is
`duplicate_in_file` or `already_exists`.
