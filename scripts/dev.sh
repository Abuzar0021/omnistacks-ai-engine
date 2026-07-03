#!/usr/bin/env bash
# Start local development: Postgres + n8n in Docker, apps on the host.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found — run ./scripts/setup.sh first." >&2
  exit 1
fi

echo "==> Starting postgres + n8n via Docker Compose..."
docker compose up -d postgres n8n

echo "==> Applying database migrations..."
npm run prisma:migrate

echo "==> Starting api + web + worker in watch mode..."
npm run dev
