# Builds the `api` process (docs/03-backend-architecture.md §1). This is
# the only deployable process in the repo so far — `ws-gateway` and
# `worker` get their own Dockerfiles here once their entrypoints exist
# (real-time and background-job features aren't built yet).
#
# Build context must be the monorepo root, not this directory, because
# `turbo prune` needs the whole workspace to compute apps/api's slice of
# it:
#
#   docker build -f apps/api/Dockerfile -t trellis-api .
#
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

# ---- prune: reduce the monorepo to just what apps/api depends on ----
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm add -g turbo@2.10.4 && turbo prune api --docker

# ---- install + build ----
FROM base AS builder
WORKDIR /app
# Installed from the pruned lockfile/package.jsons first so this layer is
# cached across builds that don't touch dependencies.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=api

# ---- runtime ----
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate
RUN addgroup --system --gid 1001 trellis && adduser --system --uid 1001 trellis
WORKDIR /app
COPY --from=builder --chown=trellis:trellis /app .
USER trellis
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3001

# Migrations are a deliberate separate step, not run on container boot —
# running them automatically on every instance start races when more than
# one instance comes up at once. Run once per deploy against DATABASE_URL
# (the migration-owner connection, not APP_DATABASE_URL):
#
#   docker run --rm -e DATABASE_URL=... trellis-api pnpm exec drizzle-kit migrate
#
# devDependencies (drizzle-kit, tsx, etc.) are intentionally still present
# in this image so that command works without a second image.
CMD ["node", "dist/index.js"]
