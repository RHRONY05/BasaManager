# syntax=docker/dockerfile:1.7
# API image. Build context = repo root:  docker build -f infra/docker/api.Dockerfile .
# Runs TypeScript with tsx (decision V3: simplest robust option, no bundler to maintain; tsx is a runtime dependency).
FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS base
ENV PNPM_HOME=/pnpm CI=true
ENV PATH=$PNPM_HOME:$PATH
# OpenSSL in the shared base too, so pnpm install / prisma generate fetch the openssl-3.0.x engines the runtime detects.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# Installs the api and everything it depends on (runs `prisma generate` through the postinstall hook).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --filter @bm/api...
# A self-contained, production-only copy of the api package (workspace packages included).
RUN pnpm --filter @bm/api deploy --prod --legacy /out \
 && cp -r apps/api/src/generated /out/src/generated \
 && cp apps/api/prisma.config.ts /out/prisma.config.ts

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runtime
# App code stays root-owned (read-only for the node user). Prisma needs OpenSSL to pick the right engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/server.ts"]
