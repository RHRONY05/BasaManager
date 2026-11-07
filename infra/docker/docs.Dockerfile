# syntax=docker/dockerfile:1.7
# Docs image: the VitePress learning site served by a tiny non-root Caddy file server on :8080. Context = repo root.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS docs-build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @bm/docs...
RUN pnpm --filter @bm/docs build

FROM caddy:2-alpine AS runtime
COPY infra/docker/static.Caddyfile /etc/caddy/Caddyfile
COPY --from=docs-build /repo/apps/docs/.vitepress/dist /srv
RUN mkdir -p /data /config && chown -R 1000:1000 /data /config /srv
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
