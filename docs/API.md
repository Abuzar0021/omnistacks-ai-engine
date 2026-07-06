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

> Auth is "none" everywhere until M5 lands; these endpoints will then require a bearer
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
(`name`/`createdAt`/`updatedAt`/`status`/`score`, `-` prefix for descending; default
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
    "score": null,
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

### Website analyses

Data collection only (see [ARCHITECTURE.md](ARCHITECTURE.md)) — no AI, scoring, email,
or n8n. Analyses run asynchronously; `POST` returns immediately with a `PENDING` record.

| Endpoint                                            | Description                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/businesses/:businessId/website-analyses` | Start an analysis; `202` with the `PENDING` record; `404` unknown business; `422` business has no website                      |
| `GET /api/businesses/:businessId/website-analyses`  | List analyses for a business, paginated, newest first                                                                          |
| `GET /api/website-analyses/:id`                     | Fetch one — serves both "check status" (`status` field) and "retrieve results" (the same resource, populated once `COMPLETED`) |
| `GET /api/website-analyses/:id/screenshot`          | Screenshot metadata (`width`, `height`, `byteSize`, `mimeType`, `url`); `404` if not yet captured                              |
| `GET /api/website-analyses/:id/screenshot/file`     | The full-page PNG itself, served with `Content-Type: image/png` (the `url` field above points here)                            |

List query parameters: `page`, `limit` (same conventions as businesses; sort is fixed to
`-createdAt`).

**Analysis shape** (abbreviated — see [DATABASE.md](DATABASE.md#website_analyses) for
every captured field):

```json
{
  "data": {
    "id": "cmr...",
    "businessId": "cmr...",
    "status": "COMPLETED",
    "requestedUrl": "https://acme.com",
    "finalUrl": "https://acme.com/",
    "statusCode": 200,
    "redirectCount": 0,
    "title": "Acme Corp",
    "technologies": ["WORDPRESS", "GOOGLE_ANALYTICS"],
    "emails": ["hello@acme.com"],
    "phones": ["+1 (555) 123-4567"],
    "screenshotWidth": 1280,
    "screenshotHeight": 4096,
    "durationMs": 2140,
    "error": null,
    "createdAt": "2026-07-03T18:00:00.000Z"
  }
}
```

A successful completion promotes the parent business from `NEW` to `ANALYZED` (a no-op if
it's already past `NEW`) — this is the only side effect the module has outside its own
table.

### Business audits

LLM-generated fit scoring (M3, see [PROMPTS.md](PROMPTS.md) for the `business-audit-v1`
prompt) — runs against a business's most recent `COMPLETED` website analysis. Audits run
asynchronously, same `PENDING`/`RUNNING`/`COMPLETED`/`FAILED` convention as website
analyses; `POST` returns immediately with a `PENDING` record.

| Endpoint                                  | Description                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/businesses/:businessId/audits` | Start an audit; `202` with the `PENDING` record; `404` unknown business; `422` no `COMPLETED` website analysis yet             |
| `GET /api/businesses/:businessId/audits`  | List audits for a business, paginated, newest first                                                                            |
| `GET /api/business-audits/:id`            | Fetch one — serves both "check status" (`status` field) and "retrieve results" (the same resource, populated once `COMPLETED`) |

List query parameters: `page`, `limit` (same conventions as businesses; sort is fixed to
`-createdAt`).

**Audit shape** (abbreviated — see
[DATABASE.md](DATABASE.md#business_audits) for every field):

```json
{
  "data": {
    "id": "cmr...",
    "businessId": "cmr...",
    "websiteAnalysisId": "cmr...",
    "status": "COMPLETED",
    "promptVersion": "business-audit-v1",
    "model": "openai/gpt-4o-mini",
    "summary": "Dated design, no clear CTA, but strong local SEO signals.",
    "findings": [
      { "category": "design", "severity": "medium", "description": "No mobile nav menu" }
    ],
    "score": 72,
    "confidence": "high",
    "reasons": ["Active blog with recent posts", "Missing contact form"],
    "disqualifiers": [],
    "totalTokens": 812,
    "durationMs": 3400,
    "error": null,
    "createdAt": "2026-07-04T18:00:00.000Z"
  }
}
```

A successful completion always writes `score` onto the parent `businesses` row, and
promotes its `status` from `ANALYZED` to `AUDITED` (idempotent — a no-op if the business
is already past `ANALYZED`, so a re-audit never regresses a business further along the
pipeline). Malformed model output is retried once (the validation error is appended to
the conversation); a second failure marks the audit `FAILED` and never persists
unvalidated output — see [PROMPTS.md](PROMPTS.md).

### Email drafts

LLM-generated outreach emails (M4, see [PROMPTS.md](PROMPTS.md) for the
`email-personalization-v1` prompt) — runs against a business's most recent `COMPLETED`
audit. Drafts run asynchronously, same `PENDING`/`RUNNING`/`COMPLETED`/`FAILED` convention
as audits and analyses; `POST` returns immediately with a `PENDING` record. Sending itself
is a separate, explicit action — drafts are reviewable before anything goes out.

| Endpoint                                        | Description                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/businesses/:businessId/email-drafts` | Start a draft; `202` with the `PENDING` record; `404` unknown business; `422` no `COMPLETED` audit yet                                                 |
| `GET /api/businesses/:businessId/email-drafts`  | List drafts for a business, paginated, newest first                                                                                                    |
| `GET /api/email-drafts/:id`                     | Fetch one — serves both "check status" and "retrieve results" (the same resource, populated once `COMPLETED`)                                          |
| `POST /api/email-drafts/:id/send`               | Trigger sending via n8n; `202` with `{ data: <draft>, triggered: boolean }`; `404` unknown draft; `422` draft not `COMPLETED` or business has no email |

List query parameters: `page`, `limit` (same conventions as businesses; sort is fixed to
`-createdAt`).

**Draft shape** (abbreviated — see [DATABASE.md](DATABASE.md#email_drafts) for every field):

```json
{
  "data": {
    "id": "cmr...",
    "businessId": "cmr...",
    "businessAuditId": "cmr...",
    "status": "COMPLETED",
    "promptVersion": "email-personalization-v1",
    "model": "openai/gpt-4o-mini",
    "subject": "Quick question about your site",
    "opener": "I noticed your homepage has no contact form.",
    "factUsed": "No contact form",
    "body": "Hi there,\n\nI noticed your homepage has no contact form.\n\nWould you be open to a quick call this week to see if it's a fit?\n\nBest,\nThe OmniStacks Team",
    "totalTokens": 210,
    "durationMs": 1800,
    "error": null,
    "sentAt": null,
    "createdAt": "2026-07-05T18:00:00.000Z"
  }
}
```

A successful completion promotes the parent business's `status` from `AUDITED` to
`EMAIL_DRAFTED` (idempotent, same pattern as business audits). `POST .../send` does
**not** mark the draft sent — it only triggers the n8n `outreach-send` workflow
(fire-and-forget; a failed trigger is reported via `triggered: false` rather than an
HTTP error, per [N8N.md](N8N.md)'s unavailable-tolerant design). `sentAt` and the
`EMAIL_SENT` status transition are only set once n8n calls back — see Webhooks below.

### Webhooks

Callbacks from n8n into the API (see [N8N.md](N8N.md) for the workflows that call these).
Every route under `/api/webhooks` requires a valid `X-Webhook-Secret` header
(`401 UNAUTHENTICATED` without one) regardless of the JWT strategy above — once M5 lands,
these routes will still authenticate via the shared secret rather than a bearer token, by
design (see [N8N.md](N8N.md)).

| Endpoint                         | Description                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/webhooks/email-sent`  | Body `{ businessId, emailDraftId }`. Sets `EmailDraft.sentAt` (if not already set) and advances the business to `EMAIL_SENT`. `204` on success (including re-delivery); `404` unknown draft/business; `422` if the draft doesn't belong to the given business. |
| `POST /api/webhooks/email-reply` | Body `{ businessId, classification }` where `classification` is `"replied"` or `"meeting_booked"`. Advances the business to `RESPONDED` or `MEETING_BOOKED` respectively. `204` on success; `404` unknown business.                                            |

Both endpoints are idempotent: re-delivering the same callback (or receiving callbacks out
of order) never regresses a business or double-applies a transition — see
`advanceStatus()` in [DATABASE.md](DATABASE.md#email_drafts).

### Lead discovery

Google Places API search (M9) — given an industry and location, searches Places for
matching businesses and bulk-creates the new ones (deduped by domain) with
`status=NEW`. Runs asynchronously, same `PENDING`/`RUNNING`/`COMPLETED`/`FAILED`
convention as analyses/audits/drafts; `POST` returns immediately with a `PENDING` job.
Requires `GOOGLE_PLACES_API_KEY` (see [DEPLOYMENT.md](DEPLOYMENT.md)) — see
[ARCHITECTURE.md](ARCHITECTURE.md) for why this replaced an earlier Yelp-scraping
approach that got reliably blocked in production.

| Endpoint                      | Description                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/lead-discovery`    | Start a search; body `{ industry, location, country?, limit? }` (`limit` 1–50, default 20); `202` with the `PENDING` job; `400` invalid input |
| `GET /api/lead-discovery`     | List past searches, paginated, newest first                                                                                                   |
| `GET /api/lead-discovery/:id` | Fetch one — serves both "check status" and "retrieve results" (the same resource, populated once `COMPLETED`)                                 |

List query parameters: `page`, `limit` (same conventions as businesses; sort is fixed to
`-createdAt`).

**Job shape** (abbreviated — see [DATABASE.md](DATABASE.md) for every field):

```json
{
  "data": {
    "id": "cmr...",
    "status": "COMPLETED",
    "industry": "Saloons",
    "location": "Texas",
    "country": "United States",
    "limit": 20,
    "foundCount": 14,
    "createdCount": 11,
    "duplicateCount": 3,
    "durationMs": 22400,
    "error": null,
    "createdAt": "2026-07-05T18:00:00.000Z"
  }
}
```

Businesses created here are ordinary `status=NEW` rows — nothing downstream
(analyze/audit/draft/send) treats them differently from a manually-added or
CSV-imported business.
