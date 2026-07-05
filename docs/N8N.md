# n8n

How workflow automation fits into the platform. Operational conventions (exporting,
naming, credentials) live in [`n8n/README.md`](../n8n/README.md); this document covers the
workflows and the integration contract. The two outreach workflows below are implemented
in milestone M4 (see [ROADMAP.md](ROADMAP.md)); the rest are deferred scaffold-era ideas —
see [Deferred workflows](#deferred-workflows).

## Role in the architecture

n8n owns **outreach and third-party integrations** — everything after a business is
qualified (audited and drafted), plus operational notifications. It never mutates the
database directly (its Postgres access is only its own `n8n` database); all reads/writes
of application data go through the REST API. In the current single-operator deployment
(see [ROADMAP.md](ROADMAP.md) sequencing notes), n8n sends via the operator's own
Gmail/SMTP credential, configured directly in the n8n UI — there is no per-user credential
management yet (that arrives with M5 auth/multi-user support).

```
API ──(webhook trigger)──▶ n8n ──(email via operator's Gmail/SMTP)──▶ prospect
 ▲                           │
 └──(status callback, REST)──┘
```

## Current workflows (M4)

Exported JSON lives in `n8n/workflows/` using the `NN-short-description.json` convention —
see [`n8n/README.md`](../n8n/README.md) for import/credential setup.

| #   | Workflow          | Trigger                                 | What it does                                                                                                                                                                                       |
| --- | ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | **Outreach send** | API calls n8n webhook (`outreach-send`) | Checks `X-Webhook-Secret`, sends the `EmailDraft`'s assembled `body` via the operator's own Gmail/SMTP credential, calls back `POST /api/webhooks/email-sent`.                                     |
| 02  | **Reply handler** | Gmail Trigger (poll, 1 min)             | Classifies an inbound reply (meeting request vs. generic reply) by keyword match, resolves the business by sender email via `GET /api/businesses?q=`, calls back `POST /api/webhooks/email-reply`. |

Both call back into a small, dedicated webhook module (`apps/api/src/modules/webhooks`) —
not a queue or job type; see [API.md](API.md#webhooks) for the payload shapes and
[DATABASE.md](DATABASE.md#email_drafts) for what gets persisted.

## Deferred workflows

These were planned before the M3/M4 reprioritization and the `Campaign`/`Lead` →
`Business` shift (see [ROADMAP.md](ROADMAP.md)). They depend on scaffold-era models
(`Campaign`, `Lead`, `scrape_jobs`) that are superseded by `Business` as the operative
entity, so none are implemented — and none are assigned a workflow number yet, to avoid
colliding with 01/02 above. Revisit if/when M7 redesigns campaign grouping around
`Business`.

| Idea                      | Trigger                            | What it would do                                                                               |
| ------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Lead intake webhook**   | n8n webhook (external forms/tools) | Receive leads from external sources, normalize fields, create businesses via the API.          |
| **CRM sync**              | Cron (hourly)                      | Push qualified businesses to a configured CRM; write external IDs back via the API.            |
| **Job failure alert**     | Cron (every 15 min)                | Query the M6 durable job queue for failures; post a Slack/email digest.                        |
| **Daily pipeline digest** | Cron (daily, `GENERIC_TIMEZONE`)   | Pull pipeline funnel stats from the API (see [ROADMAP.md](ROADMAP.md) M7) and email a summary. |

## Trigger strategy

Trigger types actually in use, plus what's deferred:

1. **Inbound webhooks (API → n8n):** the API fires a `POST` to
   `{N8N_API_BASE_URL}/webhook/outreach-send` (workflow 01) via
   `apps/api/src/lib/n8n-client.ts`. The API treats n8n as unavailable-tolerant: the
   trigger call failing must never fail the user's request — it's logged, the send just
   never happened, and the operator sees the draft is still unsent (`sentAt` is still
   null) and can retry from the UI's "Send" button. There is no automatic retry queue
   yet — that's one of the deferred reconciliation crons above.
2. **Polling triggers (n8n polls an external service):** workflow 02's Gmail Trigger
   polls the operator's inbox every minute — no inbound webhook from Gmail is needed.
3. **Cron (in n8n):** not used by anything implemented in M4; the deferred workflows
   above would use it for periodic reconciliation.

**Webhook security (both directions):** shared secret in the `X-Webhook-Secret` header
(`N8N_WEBHOOK_SECRET`, same value on both the API and the n8n container — see
`.env.example`), checked with constant-time comparison
(`apps/api/src/modules/webhooks/webhook-auth.ts`); requests without it are rejected
(`401`). The secret is never committed in exported workflow JSON — only referenced via
`$env.N8N_WEBHOOK_SECRET` expressions, resolved from the n8n container's own environment.

## Queue strategy

Two queues exist, with a clear boundary:

- **`scrape_jobs` (Postgres)** is the system's work queue — scraping, enrichment, scoring,
  sync audit. Owned by the API/worker. n8n never reads or writes this table.
- **n8n's own execution queue** handles workflow steps and their own node-level retries.
  Sending and reply classification both run synchronously within a single n8n execution —
  no multi-day waits yet (that pattern is a deferred workflow idea, not implemented) — and
  the platform only stores the resulting business status transitions.

Rule of thumb: **compute-heavy or data-producing work → `scrape_jobs`; orchestration of
external services (sending mail, reading a mailbox) → n8n.**

If workflow volume grows, n8n switches to its queue mode (separate main/worker n8n
containers sharing the `n8n` database + Redis) — a Compose change, not an application
change.

## Retry logic

Failures are expected (mail providers, rate limits). Policy by layer:

| Layer                 | Policy                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| n8n node level        | "Retry on Fail" enabled on the send/HTTP nodes: 3 tries, exponential backoff (1s/5s/25s). Idempotent operations only — see below.                                                                                                                                                                   |
| n8n workflow level    | Errored executions are kept (`EXECUTIONS_DATA_SAVE_ON_ERROR=all`) for manual replay from the n8n UI. There is no automated failure-alert workflow yet (deferred, see above) — check the n8n UI's execution list.                                                                                    |
| API-side triggers     | A failed outbound trigger (API → n8n) is logged and reported back to the caller (`triggered: false` in the `POST /api/email-drafts/:id/send` response); the draft stays unsent and can be retried manually. No hourly reconciliation cron exists yet — that's a deferred workflow, not built by M4. |
| Callbacks (n8n → API) | API webhook endpoints are **idempotent**: callbacks carry the business ID + target status, and re-delivery is a no-op (`status-pipeline.ts` never regresses or reapplies a transition). n8n retries callbacks like any external call.                                                               |

**Idempotency rules:**

- Sending email is NOT idempotent at the SMTP layer, but the **callback** is: `EmailDraft.sentAt`
  is only ever set once (`webhooks.service.ts` checks it's still `null` before setting it),
  so re-delivering the same `email-sent` callback is a no-op. This does not prevent a true
  double-send if the SMTP node itself were manually re-executed in the n8n UI — that's an
  operator-driven action, not an automated retry.
- Status callbacks are idempotent by design (above) — `advanceStatus()` only moves a
  business forward, never backward, and treats "already at or past the target" as a no-op.
- A future CRM-sync workflow (deferred, see above) would use external IDs for natural
  upsert idempotency.

## Local development

```bash
docker compose up -d postgres n8n   # n8n at http://localhost:5678
```

First run: create the local admin account, add credentials manually (they are stored in
the `n8n` database, encrypted with `N8N_ENCRYPTION_KEY`), then import workflow JSON from
`n8n/workflows/`.
