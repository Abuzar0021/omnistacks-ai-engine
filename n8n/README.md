# n8n workflows

n8n runs as a Docker Compose service (`docker compose up -d n8n`) and is available at
[http://localhost:5678](http://localhost:5678). It stores its state in the dedicated `n8n`
PostgreSQL database (created automatically on first startup by
`docker/postgres/init/01-create-n8n-db.sh`).

## Conventions

- Export workflows as JSON into `n8n/workflows/` and commit them, so automation is
  version-controlled alongside the code (in n8n: **Workflow → Download**).
- Name files `NN-short-description.json` (e.g. `01-outreach-send.json`).
- Credentials are **never** exported/committed — they live encrypted in the n8n database,
  protected by `N8N_ENCRYPTION_KEY`. Placeholder credential IDs in the exported JSON
  (`REPLACE_WITH_..._CREDENTIAL_ID`) must be repointed at a real credential after import.

## Current workflows (M4)

| File                    | Trigger                    | What it does                                                                                                                                         |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-outreach-send.json` | Webhook (`outreach-send`)  | Checks `X-Webhook-Secret`, sends the drafted email via the operator's own Gmail/SMTP credential, then calls back `POST /api/webhooks/email-sent`.    |
| `02-reply-handler.json` | Gmail Trigger (poll, 1min) | Classifies an inbound reply (meeting request vs. generic reply), looks up the business by sender email, calls back `POST /api/webhooks/email-reply`. |

**Import & setup, once per environment:**

1. **Workflow → Import from File** for both JSON files.
2. Open `01-outreach-send.json`'s **Send email (SMTP)** node and attach a real SMTP
   credential for the operator's Gmail/SMTP account (App Password recommended for Gmail).
3. Open `02-reply-handler.json`'s **Gmail Trigger** node and attach a real Gmail OAuth2
   credential for the same inbox.
4. Confirm `API_BASE_URL` and `N8N_WEBHOOK_SECRET` are set on the n8n container (see
   `.env.example`) — both workflows read them via `$env.*` expressions, and
   `N8N_WEBHOOK_SECRET` must equal the API's own `N8N_WEBHOOK_SECRET` value exactly.
5. Activate both workflows.

See [docs/N8N.md](../docs/N8N.md) for the full trigger/retry/idempotency design, and
[docs/PROMPTS.md](../docs/PROMPTS.md) for how the email content itself is generated
(`email-personalization-v1`, before it ever reaches these workflows).

## Typical integration points

- **Inbound:** n8n webhooks trigger API endpoints (e.g. start a scrape job).
- **Outbound:** the API calls n8n webhook URLs (`N8N_API_BASE_URL`) to kick off outreach
  sends; n8n calls back into the API (`API_BASE_URL`) to report status transitions.
