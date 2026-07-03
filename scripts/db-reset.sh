#!/usr/bin/env bash
# Drop and recreate the database, re-applying all migrations. DESTRUCTIVE.
set -euo pipefail

cd "$(dirname "$0")/.."

read -r -p "This will WIPE the local database. Continue? [y/N] " answer
if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

npx prisma migrate reset --schema apps/api/prisma/schema.prisma
