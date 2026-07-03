#!/usr/bin/env bash
# One-time project setup: env file, dependencies, Prisma client.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> OmniStacks AI Engine setup"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example — review and fill in secrets."
else
  echo "==> .env already exists, leaving it untouched."
fi

echo "==> Installing dependencies..."
npm install

echo "==> Generating Prisma client..."
npm run prisma:generate

echo ""
echo "Setup complete. Next steps:"
echo "  1. Edit .env (database credentials, OPENROUTER_API_KEY, ...)"
echo "  2. Start infrastructure:   ./scripts/dev.sh"
