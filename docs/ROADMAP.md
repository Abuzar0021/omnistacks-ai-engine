# Roadmap

The project is built in milestones. Each milestone is independently testable: it has a
clear scope, explicit completion criteria, and a way to verify it without the milestones
after it.

The core pipeline the platform automates mirrors the `BusinessStatus` enum:

```
NEW → ANALYZED → AUDITED → EMAIL_DRAFTED → EMAIL_SENT → RESPONDED → MEETING_BOOKED → CLIENT
                                                                             (or ARCHIVED)
```

Status legend: ✅ done · 🚧 in progress · ⬜ not started

---

## M0 — Platform scaffold ✅

**Scope:** monorepo, Docker/Compose stack (Postgres, n8n, api, web, worker), Prisma
schema, health endpoints, CI, scripts, documentation.

**Completion criteria (met):**

- [x] `npm run typecheck` and `npm run build` pass for all workspaces
- [x] `docker compose up` starts all five services
- [x] `GET /api/health/live` returns 200; `/api/health/ready` reflects DB reachability
- [x] CI runs prisma validate, format check, typecheck, build, and Docker image builds
- [x] Core documentation exists in `docs/`

---

## M1 — Lead management ✅

**Scope:** the foundation module every future feature builds on. `Business` and `Tag`
models with normalized, duplicate-proof domains; full CRUD REST API with pagination,
sorting, filtering, and search; CSV import with per-row validation and an import summary;
business list/detail/import pages in the web app; repository → service → thin controller
architecture with Zod validation and structured (pino) logging; unit + integration tests.

**Completion criteria (met):**

- [x] `Business`/`Tag` Prisma models migrated, domains normalized and unique, search
      columns indexed
- [x] `GET/POST /api/businesses`, `GET/PATCH/DELETE /api/businesses/:id` with
      pagination, sorting, filtering (status/industry/country/tag), and free-text search
- [x] `POST /api/businesses/import` (text/csv) validates email/website/duplicates per row
      and returns a summary (imported/skipped/errors/duplicates)
- [x] Web: business list (search, filters, status badges, pagination), business detail
      (edit/delete), CSV import page with summary view
- [x] Structured logs for requests, imports, and validation failures
- [x] Unit tests (domain normalization, CSV analysis, service rules) and integration
      tests (all endpoints incl. error envelopes) pass in CI against Postgres

**Independent test:** import a CSV, then browse/search/filter/edit/delete via the UI or
curl — no auth, scraping, or AI required.

---

## M2 — Authentication & user management ⬜

**Scope:** JWT-based auth on the API (see [API.md](API.md)), register/login/refresh
endpoints, password hashing, `ADMIN`/`MEMBER` role enforcement middleware, auth screens in
the web app, ownership semantics for businesses (who can see/edit what).

**Completion criteria:**

- [ ] `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` work
      end-to-end
- [ ] Protected routes return `401` without a valid token, `403` for insufficient role
- [ ] Passwords stored hashed (argon2/bcrypt), never logged
- [ ] Web app: login page, token storage, authenticated fetch in `api/client.ts`
- [ ] Integration tests cover happy path + invalid credentials + expired token

**Independent test:** create a user, log in, call a protected endpoint with and without
the token.

---

## M3 — Job queue & worker execution loop ⬜

**Scope:** the worker consumes `scrape_jobs`: atomic claiming (`SKIP LOCKED`),
`WORKER_CONCURRENCY` parallel handlers, attempts/backoff/timeouts, job status endpoints,
dead-letter handling (`FAILED` after max attempts).

**Completion criteria:**

- [ ] Two worker replicas never process the same job (verified by test)
- [ ] A crashed handler marks the job `FAILED` with `error` populated and retries up to
      max attempts with exponential backoff
- [ ] Job lifecycle timestamps (`startedAt`, `finishedAt`) recorded
- [ ] `GET /api/jobs/:id` reports live status
- [ ] A no-op `SYNC` job type exists purely for testing the loop

**Independent test:** enqueue no-op jobs, watch them drain; kill a worker mid-job and
verify retry.

---

## M4 — Website analysis (Playwright) ⬜

**Scope:** `SCRAPE`/analysis job handlers that visit a business's website with
Playwright, capture structured facts (tech stack, contact info, page content extracts,
performance basics), persist them, and move the business `NEW → ANALYZED`. Politeness
controls (delays, concurrency caps, robots awareness).

**Completion criteria:**

- [ ] An analysis job against a fixture site (served locally in tests) produces the
      expected structured result and status transition
- [ ] Re-running a job is idempotent (no duplicate data)
- [ ] Failures (timeouts, blocked pages) mark the job `FAILED` with a useful `error`
- [ ] Scraper respects configured rate limits

**Independent test:** run against a local fixture site in CI — no external network needed.

---

## M5 — AI audits & scoring (OpenRouter) ⬜

**Scope:** LLM job handlers using the prompts in [PROMPTS.md](PROMPTS.md): generate a
website/business audit from analysis output (`ANALYZED → AUDITED`) and score fit. Zod
validation of model output, retry on malformed JSON, token/cost logging.

**Completion criteria:**

- [ ] Audit output is schema-valid JSON persisted with prompt version metadata
- [ ] Malformed model output is retried once, then fails the job (never stored raw)
- [ ] Token usage per job is logged
- [ ] Tests run against a mocked OpenRouter (no live API calls in CI)

**Independent test:** seed analyzed businesses, run audits against the mock, assert
stored JSON validates and statuses transition.

---

## M6 — Outreach: email drafting, sending & n8n ⬜

**Scope:** personalized email drafting via OpenRouter (`AUDITED → EMAIL_DRAFTED`), the
n8n workflows planned in [N8N.md](N8N.md) for sending and follow-ups
(`EMAIL_DRAFTED → EMAIL_SENT`), reply handling callbacks
(`RESPONDED`/`MEETING_BOOKED`), webhook auth (shared secret), workflow JSON committed to
`n8n/workflows/`.

**Completion criteria:**

- [ ] Drafts are generated, stored, and reviewable before sending
- [ ] n8n sequence sends and reports back status transitions through the API
- [ ] Webhook endpoints reject requests without the shared secret
- [ ] All workflows exported and committed with the `NN-short-description.json` convention

**Independent test:** fire the webhooks manually with curl against a local n8n; assert
business status transitions.

---

## M7 — Dashboard & analytics ⬜

**Scope:** web dashboard with pipeline funnel metrics (businesses by status, conversion
rates, job throughput), aggregate endpoints on the API, empty/loading/error states.

**Completion criteria:**

- [ ] `GET /api/stats/pipeline` returns funnel counts in one query round-trip
- [ ] Dashboard renders metrics for a seeded pipeline
- [ ] p95 stats endpoint latency < 500ms on 100k seeded businesses

**Independent test:** seed a large dataset via script, verify numbers match SQL spot
checks.

---

## M8 — Production hardening ⬜

**Scope:** request IDs propagated across api/worker (api side exists since M1), per-user
rate limiting, backups per [DEPLOYMENT.md](DEPLOYMENT.md), TLS reverse proxy config,
image pinning + vulnerability scanning in CI, load test baseline.

**Completion criteria:**

- [ ] All services log structured JSON with request/job correlation IDs
- [ ] Backup + restore procedure executed successfully at least once (documented drill)
- [ ] Rate limits return `429` with `Retry-After`
- [ ] CI includes image scan; deploys are pinned digests
- [ ] Load test report committed (target: 100 rps API, 10 concurrent scrape jobs)

**Independent test:** kill the database and restore from backup on a scratch environment;
run the load test script.

---

## Sequencing notes

- **M1 (done)** deliberately precedes auth: the lead pipeline is the product's core and
  every later milestone operates on `Business` rows.
- M2 (auth) should land before any deployment that faces the internet.
- M3 unblocks M4 and M5; M4 and M5 can then proceed **in parallel**.
- M6 needs M5's drafts, but its n8n plumbing can start once M1 data exists.
- M7 and M8 can start any time after M1; both must finish before public launch.
- The scaffold's `Campaign`/`Lead` models remain in the schema but are superseded by
  `Business` as the operative entity; they will be repurposed or removed when campaign
  grouping is designed (decision due with M7).
