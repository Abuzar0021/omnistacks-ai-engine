# syntax=docker/dockerfile:1
# OmniStacks Worker — build from the repo root:
#   docker build -f docker/worker.Dockerfile .
#
# NOTE: the Playwright base image tag must match the `playwright` version
# pinned in apps/worker/package.json (browsers are baked into the image).

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace apps/worker

COPY apps/worker apps/worker
RUN npm run build --workspace apps/worker

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace apps/worker --omit=dev && npm cache clean --force

COPY --from=build /app/apps/worker/dist apps/worker/dist

USER pwuser

CMD ["node", "apps/worker/dist/index.js"]
