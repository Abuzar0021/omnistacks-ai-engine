#!/bin/sh
set -e

# Apply pending Prisma migrations before starting the API.
echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

exec "$@"
