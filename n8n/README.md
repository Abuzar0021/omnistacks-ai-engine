# n8n workflows

n8n runs as a Docker Compose service (`docker compose up -d n8n`) and is available at
[http://localhost:5678](http://localhost:5678). It stores its state in the dedicated `n8n`
PostgreSQL database (created automatically on first startup by
`docker/postgres/init/01-create-n8n-db.sh`).

## Conventions

- Export workflows as JSON into `n8n/workflows/` and commit them, so automation is
  version-controlled alongside the code (in n8n: **Workflow → Download**).
- Name files `NN-short-description.json` (e.g. `01-lead-intake-webhook.json`).
- Credentials are **never** exported/committed — they live encrypted in the n8n database,
  protected by `N8N_ENCRYPTION_KEY`.

## Typical integration points

- **Inbound:** n8n webhooks trigger API endpoints (e.g. start a scrape job).
- **Outbound:** the API/worker call n8n webhook URLs (`WEBHOOK_URL`) to kick off
  outreach sequences, CRM syncs, notifications, etc.
