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

## M2 — Website Analyzer ✅

**Scope:** a self-contained data-collection module — deliberately **no AI, scoring,
email, or n8n**. Given a business, launches Playwright, visits its website (following
redirects, tolerating invalid TLS certs, bounded by navigation/stability timeouts),
and captures a full-page screenshot plus structured page data: title, meta description,
canonical URL, language, favicon, H1–H6 headings, Open Graph/Twitter Card tags, JSON-LD,
internal/external/navigation/footer links, images, videos, contact forms, emails, phone
numbers, social links, and best-effort technology detection (WordPress, Shopify, Wix,
Squarespace, React, Next.js, Angular, Vue, Google Analytics, Google Tag Manager,
Cloudflare, Facebook Pixel). Runs asynchronously in-process (`PENDING → RUNNING →
COMPLETED`/`FAILED`) behind a small concurrency gate — not the durable job queue
scoped for M6.

**Completion criteria (met):**

- [x] `WebsiteAnalysis` Prisma model (own table, not `scrape_jobs`) with a `businessId`
      FK, cascade delete, and indexes on `(businessId)`, `(status)`, `(createdAt)`
- [x] `POST /api/businesses/:businessId/website-analyses` starts an analysis (`202`,
      `404` unknown business, `422` no website configured)
- [x] `GET /api/website-analyses/:id` reports status and (once completed) full results;
      `GET .../screenshot` returns metadata + a servable file URL;
      `GET /api/businesses/:businessId/website-analyses` lists history, paginated
- [x] Redirects, invalid TLS certificates, and navigation timeouts are all handled
      without crashing the analysis (recorded as either a successful result or a
      `FAILED` status with a clear `error` message)
- [x] Successful completion promotes the business `NEW → ANALYZED` (idempotent — no-op
      if already past `NEW`)
- [x] Structured logs for start/complete/redirects/timeouts/errors, each with duration
- [x] Web: "Analyze website" button + live status + history table on the business detail
      page, and a details page rendering every captured category plus the screenshot
- [x] Unit tests for every pure extraction/classification function (links, contact info,
      social links, technology detection, PNG dimensions) and the service's orchestration
      logic (mocked repository/business-repo/capture); integration tests drive a real
      headless Chromium against local HTTP **and self-signed HTTPS** fixture servers,
      covering the full pipeline, redirects, TLS tolerance, timeouts, and unreachable
      hosts — no external network required

**Independent test:** create a business with a website, `POST` an analysis, poll until
`COMPLETED`, and browse the result via the API or the business detail/analysis-details
pages — no auth, job queue, or AI required.

---

## M3 — AI audits & scoring (OpenRouter) ✅

> Reprioritized ahead of authentication and the generic job queue — this is the fastest
> path to outreach actually going out (see [Sequencing notes](#sequencing-notes)).

**Scope:** LLM job handlers using the prompts in [PROMPTS.md](PROMPTS.md): generate a
website/business audit from the M2 analysis output (`ANALYZED → AUDITED`) and score fit.
Zod validation of model output, retry on malformed JSON, token/cost logging.

**Completion criteria (met):**

- [x] Audit output is schema-valid JSON persisted with prompt version metadata
- [x] Malformed model output is retried once, then fails the job (never stored raw)
- [x] Token usage per job is logged
- [x] Tests run against a mocked OpenRouter (no live API calls in CI)

**Independent test:** seed analyzed businesses (M2 output), run audits against the mock,
assert stored JSON validates and statuses transition.

---

## M4 — Outreach: email drafting, sending & n8n ✅

**Scope:** personalized email drafting via OpenRouter (`AUDITED → EMAIL_DRAFTED`), the
n8n workflows planned in [N8N.md](N8N.md) for sending (via the operator's own
Gmail/SMTP account, per the current single-operator deployment — see
[N8N.md](N8N.md) for connection setup) and follow-ups
(`EMAIL_DRAFTED → EMAIL_SENT`), reply handling callbacks
(`RESPONDED`/`MEETING_BOOKED`), webhook auth (shared secret), workflow JSON committed to
`n8n/workflows/`.

**Completion criteria (met):**

- [x] Drafts are generated, stored, and reviewable before sending
- [x] n8n sequence sends via the connected Gmail/SMTP account and reports back status
      transitions through the API
- [x] Webhook endpoints reject requests without the shared secret
- [x] All workflows exported and committed with the `NN-short-description.json` convention

**Independent test:** fire the webhooks manually with curl against a local n8n; assert
business status transitions.

---

## M9 — Lead discovery (Google Places API) ✅

> Reprioritized ahead of M5-M8, same rationale as M3/M4: this is what actually populates
> the pipeline with businesses to work, rather than requiring every lead to be manually
> added or CSV-imported first. Numbered M9 (after M8) rather than inserted mid-sequence
> to avoid renumbering the already-cross-referenced M5-M8 sections below.

**Scope:** given an industry + location query, searches Google Places API for matching
businesses and their websites, dedupes against existing businesses by domain (same rule
CSV import uses), and bulk-creates the new ones with `status=NEW` — from there they flow
through the exact same analyze → audit → draft → send pipeline as any other business.
Runs asynchronously in-process (`PENDING → RUNNING → COMPLETED`/`FAILED`), same
convention as M2/M3/M4, gated by its own concurrency limiter
(`LEAD_DISCOVERY_MAX_CONCURRENCY`).

**Revision note:** this milestone originally scraped Yelp's HTML directly (via
Playwright) instead of using an official API, specifically to avoid per-request costs —
a disclosed tradeoff at the time. In production, that scraper was reliably blocked by
Yelp's bot detection (every search completed with an empty page title and a sub-second
response — the signature of a block/challenge page, not a real one). No client-side
tweaking reliably beats detection like that, so the module was rebuilt around Google
Places API: no bot-blocking risk, at the cost of a real per-request fee past Google's
monthly free credit (see [DEPLOYMENT.md](DEPLOYMENT.md)).

**Completion criteria (met):**

- [x] `LeadDiscoveryJob` Prisma model (own table) tracks each search's query, status,
      counts (`foundCount`/`createdCount`/`duplicateCount`), and timing
- [x] `POST /api/lead-discovery` starts a search (`202`, `400` invalid industry/location
      or limit outside `1..50`)
- [x] `GET /api/lead-discovery/:id` reports status and (once completed) result counts;
      `GET /api/lead-discovery` lists history, paginated
- [x] New businesses are deduped against existing ones by normalized domain (identical
      rule to CSV import's duplicate detection) before insertion
- [x] Unit tests for the pure Places-API-response mapping helpers; an integration test
      against a local fixture mimicking Places API's response shape (no real Google
      calls in CI); service tests with a mocked search client covering
      persistence/dedup/job-lifecycle logic
- [x] Web: a "Find leads" page (industry/location/country/limit form, live status,
      result counts, recent-searches history)

**Independent test:** `POST /api/lead-discovery` with an industry and location, poll
until `COMPLETED`, and confirm new `NEW`-status businesses appear in the Businesses list.

---

## M5 — Authentication & user management ⬜

> Deferred behind M3/M4: the platform is currently run by a single operator, not exposed
> publicly, so auth isn't blocking outreach. **Must land before any public/multi-user
> deployment** — see [Sequencing notes](#sequencing-notes).

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

## M6 — Job queue & worker execution loop ⬜

> Deferred behind M3/M4: current volume doesn't need durable multi-instance queueing yet;
> M3/M4's jobs reuse the M2-style in-process concurrency limiter for now.

**Scope:** the worker consumes `scrape_jobs`: atomic claiming (`SKIP LOCKED`),
`WORKER_CONCURRENCY` parallel handlers, attempts/backoff/timeouts, job status endpoints,
dead-letter handling (`FAILED` after max attempts). This is the durable, multi-instance
queue infrastructure — a different concern from the website analyzer's small in-process
concurrency gate (M2), which stays as-is; nothing here requires changing it.

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

**Priority as of M2 completion: fastest path to real outreach.** The platform is
currently run by a single operator (not a public/multi-tenant deployment), so M3 and M4
were pulled ahead of auth and the durable job queue — they're what actually turns
collected data into sent emails and booked meetings. Auth and the job queue are not
gone, just deferred until the triggers below apply.

- **M2 (done)** unblocks M3 directly — audits run against the website analyzer's output.
  It never depended on auth.
- **M3** depends only on M2's analysis output; it does not need M6 (the durable job
  queue) to start — it reuses the M2-style in-process concurrency limiter, same as the
  analyzer.
- **M4** needs M3's audit/draft output and an email account connected in n8n (Gmail/SMTP
  for the current single-operator setup — see [N8N.md](N8N.md)); its n8n plumbing
  (workflow scaffolding, webhook auth) can start in parallel with M3.
- **M5 (auth)** — build it before: (a) more than one person needs to log in, or
  (b) the API is exposed on the public internet. Neither is true yet. Revisit after M4.
- **M6 (job queue)** — build it when M3/M4 job volume actually outgrows the in-process
  concurrency limiter (see [ARCHITECTURE.md](ARCHITECTURE.md) future-scaling notes), not
  before.
- M7 and M8 can start any time after M1; both must finish before public launch — and
  M5 (auth) must finish before public launch too, regardless of milestone number.
- **M9 (lead discovery)** — built immediately after M4 for the same reason M3/M4 jumped
  the queue: it's on the critical path to real outreach (nothing to analyze/audit/draft
  without businesses to work), and it only needs M1's `Business`/dedup logic, not auth
  or the job queue.
- The scaffold's `Campaign`/`Lead` models remain in the schema but are superseded by
  `Business` as the operative entity; they will be repurposed or removed when campaign
  grouping is designed (decision due with M7).
