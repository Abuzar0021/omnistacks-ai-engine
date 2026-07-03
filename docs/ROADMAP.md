# Roadmap

The project is built in milestones. Each milestone is independently testable: it has a
clear scope, explicit completion criteria, and a way to verify it without the milestones
after it.

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

## M1 — Authentication & user management ⬜

**Scope:** JWT-based auth on the API (see [API.md](API.md)), register/login/refresh
endpoints, password hashing, `ADMIN`/`MEMBER` role enforcement middleware, auth screens in
the web app.

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

## M2 — Campaign & lead CRUD ⬜

**Scope:** REST resources for campaigns and leads (list/get/create/update/archive),
pagination and filtering per [API.md](API.md), CSV lead import (`source=IMPORTED`),
campaign/lead pages in the web app.

**Completion criteria:**

- [ ] Full CRUD for `/api/campaigns` and `/api/campaigns/:id/leads` with Zod validation
- [ ] Ownership enforced: users only see their own campaigns (admins see all)
- [ ] CSV import creates leads with per-row error reporting
- [ ] Web: campaign list/detail, lead table with status filters
- [ ] Integration tests for every endpoint incl. validation failures

**Independent test:** exercise the API with curl/tests only — no worker or n8n required.

---

## M3 — Job queue & worker execution loop ⬜

**Scope:** the worker actually consumes `scrape_jobs`: atomic claiming (`SKIP LOCKED`),
`WORKER_CONCURRENCY` parallel handlers, attempts/backoff/timeouts, `POST /api/jobs` +
job status endpoints, dead-letter handling (`FAILED` after max attempts).

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

## M4 — Playwright scraping pipeline ⬜

**Scope:** `SCRAPE` job handler in `apps/worker/src/jobs/`, per-source scraper modules
using `src/browser.ts`, dedupe on insert (email/URL), politeness controls (delays,
concurrency caps, robots awareness), scraped leads land as `NEW`.

**Completion criteria:**

- [ ] A scrape job against a fixture site (served locally in tests) produces correct
      `Lead` rows
- [ ] Re-running the same job does not duplicate leads
- [ ] Failures (timeouts, blocked pages) mark the job `FAILED` with a useful `error`
- [ ] Scraper respects configured rate limits

**Independent test:** run against a local fixture site in CI — no external network needed.

---

## M5 — LLM enrichment & scoring ⬜

**Scope:** `ENRICH` and `SCORE` job handlers calling OpenRouter through the shared client;
prompts and JSON schemas exactly as specified in [PROMPTS.md](PROMPTS.md); Zod validation
of model output; retry on malformed JSON; cost logging (token usage).

**Completion criteria:**

- [ ] Enrichment writes schema-valid JSON to `Lead.enrichment`, sets `status=ENRICHED`
- [ ] Scoring writes `score` (0–100) and sets `QUALIFIED`/`DISQUALIFIED` per threshold
- [ ] Malformed model output is retried once, then fails the job (never stored raw)
- [ ] Token usage per job is logged
- [ ] Tests run against a mocked OpenRouter (no live API calls in CI)

**Independent test:** seed leads manually (no scraping needed), run enrichment against the
mock, assert stored JSON validates.

---

## M6 — n8n outreach integration ⬜

**Scope:** the workflows planned in [N8N.md](N8N.md): outreach sequence trigger from the
API, status callbacks from n8n to the API (`CONTACTED`/`CONVERTED`), failure alerting,
webhook auth (shared secret), workflow JSON committed to `n8n/workflows/`.

**Completion criteria:**

- [ ] Qualified lead triggers the outreach workflow via webhook
- [ ] n8n callback updates lead status through the public API (authenticated)
- [ ] Webhook endpoints reject requests without the shared secret
- [ ] All workflows exported and committed with the `NN-short-description.json` convention

**Independent test:** fire the webhooks manually with curl against a local n8n; assert
lead status transitions.

---

## M7 — Dashboard & analytics ⬜

**Scope:** web dashboard with campaign funnel metrics (leads by status, conversion rates,
job throughput), aggregate endpoints on the API, empty/loading/error states.

**Completion criteria:**

- [ ] `GET /api/campaigns/:id/stats` returns funnel counts in one query round-trip
- [ ] Dashboard renders metrics for a seeded campaign
- [ ] p95 stats endpoint latency < 500ms on 100k seeded leads

**Independent test:** seed a large campaign via script, verify numbers match SQL spot
checks.

---

## M8 — Production hardening ⬜

**Scope:** structured logging (pino), request IDs across api/worker, per-user rate
limiting, backups per [DEPLOYMENT.md](DEPLOYMENT.md), TLS reverse proxy config, image
pinning + vulnerability scanning in CI, load test baseline.

**Completion criteria:**

- [ ] All logs structured JSON with request/job correlation IDs
- [ ] Backup + restore procedure executed successfully at least once (documented drill)
- [ ] Rate limits return `429` with `Retry-After`
- [ ] CI includes image scan; deploys are pinned digests
- [ ] Load test report committed (target: 100 rps API, 10 concurrent scrape jobs)

**Independent test:** kill the database and restore from backup on a scratch environment;
run the load test script.

---

## Sequencing notes

- M1 → M2 are strictly ordered (ownership needs auth).
- M3 unblocks M4 and M5, which can proceed **in parallel**.
- M6 needs M2 (lead statuses) but only a stub of M5 (a manually qualified lead).
- M7 and M8 can start any time after M2; both must finish before public launch.
