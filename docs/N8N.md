# n8n

How workflow automation fits into the platform. Operational conventions (exporting,
naming, credentials) live in [`n8n/README.md`](../n8n/README.md); this document covers the
planned workflows and the integration contract. Workflows are implemented in milestone M6
(see [ROADMAP.md](ROADMAP.md)).

## Role in the architecture

n8n owns **outreach and third-party integrations** — everything after a lead is qualified,
plus operational notifications. It never mutates the database directly (its Postgres
access is only its own `n8n` database); all reads/writes of application data go through
the REST API with an authenticated service account.

```
API ──(webhook trigger)──▶ n8n ──(email/CRM/Slack)──▶ external services
 ▲                           │
 └──(status callback, REST)──┘
```

## Planned workflows

Exported JSON lives in `n8n/workflows/` using the `NN-short-description.json` convention.

| #   | Workflow                  | Trigger                                | What it does                                                                                                                                                                              |
| --- | ------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | **Lead intake webhook**   | n8n webhook (external forms/tools)     | Receives leads from external sources (site forms, Zapier-style tools), normalizes fields, `POST /api/campaigns/:id/leads` with `source=API`.                                              |
| 02  | **Outreach sequence**     | API calls n8n webhook on qualification | Multi-step email sequence: personalize (using stored `email-personalization-v1` output), send step 1, wait N days, conditional follow-ups; stops on reply. Calls back `status=CONTACTED`. |
| 03  | **Reply handler**         | Email provider trigger (IMAP/API)      | Detects replies, classifies (interested / not now / unsubscribe), updates lead via API (`CONVERTED` or `DISQUALIFIED`), notifies the campaign owner.                                      |
| 04  | **CRM sync**              | Cron (hourly)                          | Pushes `QUALIFIED`+ leads to the configured CRM; writes external IDs back via API (`JobType=SYNC` audit row).                                                                             |
| 05  | **Job failure alert**     | Cron (every 15 min)                    | Queries `GET /api/jobs?status=FAILED&since=...`; posts a Slack/email digest so failures never go unnoticed.                                                                               |
| 06  | **Daily campaign digest** | Cron (daily, `GENERIC_TIMEZONE`)       | Pulls per-campaign funnel stats from the API and emails owners a summary.                                                                                                                 |

## Trigger strategy

Three trigger types, used deliberately:

1. **Inbound webhooks (API → n8n):** the API fires-and-forgets a `POST` to
   `{WEBHOOK_URL}/webhook/<workflow>` for event-driven workflows (02). The API treats n8n
   as unavailable-tolerant: the trigger call failing must never fail the user's request —
   it's logged and retried by the failure-alert path.
2. **External webhooks (third parties → n8n):** intake sources hit n8n directly (01), so
   spikes in external traffic never touch the API unvalidated — n8n normalizes and
   forwards.
3. **Cron (in n8n):** periodic reconciliation (04, 05, 06). Reconciliation crons are the
   safety net for missed events — sync state, don't assume every webhook arrived.

**Webhook security (both directions):** shared secret in the `X-Webhook-Secret` header,
checked with constant-time comparison; requests without it are rejected (`401`). Secrets
live in env (`.env` / n8n credentials store, encrypted with `N8N_ENCRYPTION_KEY`) — never
in exported workflow JSON.

## Queue strategy

Two queues exist, with a clear boundary:

- **`scrape_jobs` (Postgres)** is the system's work queue — scraping, enrichment, scoring,
  sync audit. Owned by the API/worker. n8n never reads or writes this table.
- **n8n's own execution queue** handles workflow steps (waits between emails, retries of
  a CRM call). Long outreach sequences (multi-day waits) live entirely in n8n — the
  platform only stores the resulting lead status transitions.

Rule of thumb: **compute-heavy or data-producing work → `scrape_jobs`; time-based
orchestration of external services → n8n.**

If workflow volume grows, n8n switches to its queue mode (separate main/worker n8n
containers sharing the `n8n` database + Redis) — a Compose change, not an application
change.

## Retry logic

Failures are expected (mail providers, CRMs, rate limits). Policy by layer:

| Layer                 | Policy                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| n8n node level        | "Retry on Fail" enabled on every external call node: 3 tries, exponential backoff (1s/5s/25s). Idempotent operations only — see below.                                                                        |
| n8n workflow level    | On final failure, the workflow's error branch posts to the job-failure alert path (05) with the execution URL. Errored executions are kept (`EXECUTIONS_DATA_SAVE_ON_ERROR=all`) for replay from the n8n UI.  |
| API-side triggers     | The API logs failed trigger calls; the hourly reconciliation crons (04–06) re-derive state from the database, so a lost webhook self-heals within an hour.                                                    |
| Callbacks (n8n → API) | API webhook endpoints are **idempotent**: callbacks carry the lead ID + target status, and re-delivery is a no-op (state machine ignores repeated transitions). n8n retries callbacks like any external call. |

**Idempotency rules:**

- Sending email is NOT idempotent → the sequence workflow records each sent step (via API
  callback) _before_ advancing, and checks it on retry so a retried execution never
  double-sends.
- CRM upserts use external IDs → naturally idempotent.
- Status callbacks are idempotent by design (above).

## Local development

```bash
docker compose up -d postgres n8n   # n8n at http://localhost:5678
```

First run: create the local admin account, add credentials manually (they are stored in
the `n8n` database, encrypted with `N8N_ENCRYPTION_KEY`), then import workflow JSON from
`n8n/workflows/`.
