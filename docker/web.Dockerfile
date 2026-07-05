# syntax=docker/dockerfile:1
# OmniStacks Web — build from the repo root:
#   docker build -f docker/web.Dockerfile .

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# API base URL baked into the bundle; "/api" is proxied by nginx (below).
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/web

COPY apps/web apps/web
RUN npm run build --workspace apps/web

# ---------------------------------------------------------------------------
# Runtime stage — static files served by nginx
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null || exit 1
