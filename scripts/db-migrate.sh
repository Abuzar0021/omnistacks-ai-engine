#!/usr/bin/env bash
# Create/apply a development migration. Usage: ./scripts/db-migrate.sh [migration-name]
set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -ge 1 ]; then
  npm run prisma:migrate --workspace apps/api -- --name "$1"
else
  npm run prisma:migrate --workspace apps/api
fi
