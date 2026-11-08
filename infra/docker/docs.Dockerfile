# syntax=docker/dockerfile:1.7
# Docs image: the VitePress learning site served by a tiny non-root Caddy file server on :8080. Context = repo root.
FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS docs-build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @bm/docs...
RUN pnpm --filter @bm/docs build

FROM caddy:2.11.9-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9 AS runtime
COPY infra/docker/static.Caddyfile /etc/caddy/Caddyfile
COPY --from=docs-build /repo/apps/docs/.vitepress/dist /srv
RUN mkdir -p /data /config && chown -R 1000:1000 /data /config /srv
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
