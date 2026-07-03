# syntax=docker/dockerfile:1
# OmniStacks API — build from the repo root:
#   docker build -f docker/api.Dockerfile .
#
# Base image: the official Playwright image (matching worker.Dockerfile's
# pinned version). The API now drives Chromium itself for the website
# analyzer module — Alpine isn't a supported target for Playwright's bundled
# browser binaries, so this uses the same Debian-based image as the worker.

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace apps/api

COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build --workspace apps/api

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace apps/api --omit=dev && npm cache clean --force

# Prisma schema + client (the `prisma` CLI is a production dependency so the
# entrypoint can run `prisma migrate deploy` on boot)
COPY apps/api/prisma apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

COPY --from=build /app/apps/api/dist apps/api/dist
COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p apps/api/storage/screenshots \
  && chmod +x /usr/local/bin/entrypoint.sh \
  && chown -R pwuser:pwuser /app

USER pwuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
