# syntax=docker/dockerfile:1.7
# Web image: the Vite build served by a tiny non-root Caddy file server on :8080.
# Build context = repo root.  The "web-build" target also keeps the source maps (CI uploads them to Sentry, never serves them).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS web-build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @bm/web...
RUN pnpm --filter @bm/web build

FROM caddy:2-alpine AS runtime
COPY infra/docker/static.Caddyfile /etc/caddy/Caddyfile
# Source maps stay in the web-build stage; they are not served.
COPY --from=web-build /repo/apps/web/dist /srv
RUN find /srv -name '*.map' -delete \
 && mkdir -p /data /config && chown -R 1000:1000 /data /config /srv
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
