# syntax=docker/dockerfile:1.7
# Worker image (cron jobs, outbox delivery, PDFs later). Build context = repo root.
# Same approach as the api image: tsx at runtime. The worker imports @bm/api (config, logger, services), so the
# generated Prisma client has to be copied into that workspace copy as well.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @bm/worker...
RUN pnpm --filter @bm/worker deploy --prod --legacy /out \
 && cp -r apps/api/src/generated "$(readlink -f /out/node_modules/@bm/api)/src/generated"

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
# The worker has no HTTP port; "healthy" means the process is alive (it exits on any fatal boot error).
CMD ["node", "--import", "tsx", "src/index.ts"]
