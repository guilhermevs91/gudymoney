# =============================================================================
# Gudy Money API — monorepo Dockerfile
# Build context: repo root  →  docker-compose sets: context: .
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /repo
RUN npm install -g pnpm@9 --quiet

# -----------------------------------------------------------------------------
# Stage: deps — install all workspace deps (needs ALL package.json manifests)
# -----------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY apps/api/package.json         ./apps/api/
COPY apps/web/package.json         ./apps/web/
COPY apps/mobile/package.json      ./apps/mobile/

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage: builder — generate Prisma client + compile TypeScript
# -----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /repo/node_modules                  ./node_modules
COPY --from=deps /repo/apps/api/node_modules         ./apps/api/node_modules
COPY --from=deps /repo/packages/shared/node_modules  ./packages/shared/node_modules

COPY . .

# Generate Prisma client
RUN pnpm --filter @gudy/api exec prisma generate

# Compile TypeScript
RUN pnpm --filter @gudy/api build

# -----------------------------------------------------------------------------
# Stage: runner — lean production image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 apiuser

COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/dist          ./dist
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/node_modules  ./node_modules
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/prisma        ./prisma
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/package.json  ./package.json

USER apiuser
EXPOSE 3001

# Run DB migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
