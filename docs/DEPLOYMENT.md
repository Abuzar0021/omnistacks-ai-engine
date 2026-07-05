# Deployment

How to run OmniStacks AI Engine: locally for development, fully in Docker, and in
production.

## Local development

Apps run on the host (fast reload); infrastructure runs in Docker.

```bash
# One-time: install deps, create .env from the template, generate the Prisma client
./scripts/setup.sh

# Edit .env — at minimum JWT_SECRET, N8N_ENCRYPTION_KEY, OPENROUTER_API_KEY

# Start Postgres + n8n in Docker, apply migrations, run api+web+worker in watch mode
./scripts/dev.sh
```

| Service  | URL                       | Notes                           |
| -------- | ------------------------- | ------------------------------- |
| Web      | http://localhost:5173     | Vite dev server, proxies `/api` |
| API      | http://localhost:4000/api | `tsx watch`                     |
| n8n      | http://localhost:5678     |                                 |
| Postgres | localhost:5432            | `omnistacks` + `n8n` databases  |

Useful scripts: `./scripts/db-migrate.sh <name>` (new migration),
`./scripts/db-reset.sh` (wipe local DB, destructive), `npm run prisma:studio`.

## Docker (full stack)

Everything containerized — closest to production:

```bash
cp .env.example .env    # fill in secrets first
docker compose up -d --build
```

What happens:

- `postgres` starts first (healthcheck-gated); on an empty volume the init script also
  creates the `n8n` database.
- `api` waits for Postgres to be healthy, applies migrations via its entrypoint
  (`prisma migrate deploy`), then serves on `:4000`.
- `web` (nginx) serves the built SPA on `:8080` and proxies `/api` to the api container.
- `worker` starts idle (until job handlers exist, M3+).
- `n8n` serves on `:5678`, state in the `n8n` database + `n8n_data` volume.

Operations:

```bash
docker compose ps                  # status + health
docker compose logs -f api         # follow one service
docker compose up -d --build api   # rebuild/redeploy one service
docker compose down                # stop (volumes preserved)
```

## Production deployment

Baseline: a single VM (4 vCPU / 8 GB is plenty pre-scale) running the same Compose file.
The scaling path beyond one VM is in [ARCHITECTURE.md](ARCHITECTURE.md).

**Production checklist — differences from dev defaults:**

1. **Secrets:** every `change-me` in `.env` replaced (`openssl rand -hex 32` for
   `JWT_SECRET`, `N8N_ENCRYPTION_KEY`); strong `POSTGRES_PASSWORD`. `.env` lives only on
   the host (mode `600`), or use compose secrets / your platform's secret store.
2. **TLS + single entrypoint:** put a reverse proxy (Caddy or Traefik) in front; route
   `https://app.example.com` → `web:80` and `https://n8n.example.com` → `n8n:5678`.
   Then **remove the published ports** for `postgres`, `api`, and `n8n` from the Compose
   file — only the proxy is exposed. Set `N8N_PROTOCOL=https`, `N8N_HOST`, and
   `WEBHOOK_URL` to the public n8n URL, and `API_CORS_ORIGIN` to the public web origin.
3. **Pinned images:** deploy by image digest or exact tag (already pinned for `postgres`
   and `n8n`; api/web/worker are built from the repo at a known commit).
4. **Restart policy:** all services use `restart: unless-stopped` (already configured);
   healthchecks gate dependency startup.
5. **Migrations:** automatic on api boot. For releases containing destructive migrations,
   take a backup first (below) — enforced by PR rule in [DATABASE.md](DATABASE.md).
6. **Resource limits:** add `mem_limit`/`cpus` for `worker` (Chromium is hungry) so a
   scraping spike can't starve the API.
7. **Updates:** `git pull && docker compose up -d --build` from a tagged release. Watch
   `docker compose ps` until all services are healthy; `docker compose logs api` should
   show migrations applying cleanly.

**Rollback:** re-deploy the previous tag. Because migrations must be backward compatible
(expand → migrate → contract, per [DATABASE.md](DATABASE.md)), the previous app version
runs safely against the newer schema. If a migration itself must be undone, restore from
backup (below) — never hand-edit the schema in production.

## Environment variables

`.env.example` is the authoritative template — every variable, documented, with dev
defaults. Summary:

| Variable                                        | Used by     | Purpose                                             | Prod notes                                                                     |
| ----------------------------------------------- | ----------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                                      | api, worker | `development` / `production`                        | `production`                                                                   |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` / `_PORT` | postgres    | Database bootstrap credentials                      | Strong password; no published port                                             |
| `DATABASE_URL`                                  | api, worker | Prisma connection string                            | Host `postgres` inside Compose                                                 |
| `API_PORT`                                      | api         | Listen port (default `4000`)                        |                                                                                |
| `API_CORS_ORIGIN`                               | api         | Allowed origins (comma-separated)                   | Public web origin                                                              |
| `JWT_SECRET`                                    | api         | Token signing secret                                | 32+ random bytes, rotated on compromise                                        |
| `WEB_PORT`                                      | web         | Published nginx port (default `8080`)               | Behind reverse proxy                                                           |
| `VITE_API_URL`                                  | web (build) | API base URL baked into the bundle (default `/api`) | Keep `/api` (same-origin)                                                      |
| `OPENROUTER_API_KEY`                            | api, worker | OpenRouter auth                                     | Required for M5+                                                               |
| `OPENROUTER_BASE_URL`                           | api, worker | Gateway URL                                         | Default fine                                                                   |
| `OPENROUTER_MODEL`                              | api, worker | Default model                                       | Cost/quality lever                                                             |
| `WORKER_CONCURRENCY`                            | worker      | Parallel job handlers                               | Tune to CPU/memory                                                             |
| `PLAYWRIGHT_HEADLESS`                           | api, worker | Headless browser toggle                             | `true`                                                                         |
| `ANALYSIS_MAX_CONCURRENCY`                      | api         | Simultaneous website analyses                       | Tune to CPU/memory (Playwright launches are heavy)                             |
| `ANALYSIS_NAVIGATION_TIMEOUT_MS`                | api         | Max time to load a target page                      | Default `30000` fine                                                           |
| `ANALYSIS_STABLE_TIMEOUT_MS`                    | api         | Max wait for network idle before capturing          | Default `5000` fine                                                            |
| `SCREENSHOT_STORAGE_DIR`                        | api         | Where analysis screenshots are written              | Mount a volume (`api_screenshots` in Compose) so they survive restarts         |
| `GOOGLE_PLACES_API_KEY`                         | api         | Auth for Google Places API (lead discovery)         | Requires a Google Cloud project with Places API (New) enabled + billing set up |
| `GOOGLE_PLACES_BASE_URL`                        | api         | Places API host                                     | Default fine                                                                   |
| `LEAD_DISCOVERY_MAX_CONCURRENCY`                | api         | Simultaneous lead-discovery searches                | Tune to your Places API quota                                                  |
| `N8N_PORT` / `N8N_HOST` / `N8N_PROTOCOL`        | n8n         | Public identity of the n8n instance                 | Public HTTPS values                                                            |
| `WEBHOOK_URL`                                   | n8n, api    | Base URL for n8n webhooks                           | Public HTTPS URL                                                               |
| `N8N_ENCRYPTION_KEY`                            | n8n         | Encrypts stored credentials                         | **Losing it = losing all n8n credentials.** Back it up separately.             |
| `GENERIC_TIMEZONE`                              | n8n         | Cron timezone                                       |                                                                                |

Env vars are validated at startup with Zod (`apps/*/src/config/env.ts`); a misconfigured
service exits immediately with the offending field names.

## Backup strategy

**What must be backed up:**

| Asset                               | Where                 | Method                                                                                                    |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| Application data                    | `omnistacks` database | Nightly `pg_dump`                                                                                         |
| n8n state (credentials, executions) | `n8n` database        | Nightly `pg_dump`                                                                                         |
| n8n instance files                  | `n8n_data` volume     | Nightly tar of the volume                                                                                 |
| `.env` (incl. `N8N_ENCRYPTION_KEY`) | Host                  | Stored in the team secret manager — a DB backup without the encryption key cannot decrypt n8n credentials |

Workflow JSON and code need no backup — they live in git. Website analysis screenshots
(`api_screenshots` volume) are excluded too — they're regenerable by re-running the
analysis, not a system of record.

**Nightly dump (host cron):**

```bash
#!/usr/bin/env bash
# /etc/cron.daily/omnistacks-backup — dumps both databases + n8n volume
set -euo pipefail
STAMP=$(date +%F)
BACKUP_DIR=/var/backups/omnistacks
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc omnistacks \
  > "$BACKUP_DIR/omnistacks-$STAMP.dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc n8n \
  > "$BACKUP_DIR/n8n-$STAMP.dump"
docker run --rm -v omnistacks_n8n_data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/n8n-data-$STAMP.tar.gz" -C /data .

find "$BACKUP_DIR" -mtime +14 -delete   # keep 14 days locally
# Ship offsite (choose one): rclone/aws s3 cp/restic to object storage
```

Retention: 14 days local + 90 days offsite. Take an extra manual dump before any release
with a destructive migration.

**Restore procedure:**

```bash
docker compose stop api worker n8n
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" --clean --if-exists \
  -d omnistacks < omnistacks-YYYY-MM-DD.dump
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" --clean --if-exists \
  -d n8n < n8n-YYYY-MM-DD.dump
docker compose start api worker n8n
```

**Drill:** the restore procedure is executed against a scratch environment at least once
before launch (M8 completion criterion) and quarterly after — an untested backup is not a
backup.
