# =============================================================================
# Gudy Money API — monorepo Dockerfile
# Build context: repo root  →  docker-compose sets: context: .
# =============================================================================

FROM node:20-alpine AS base
RUN npm install -g pnpm@9 --quiet

# -----------------------------------------------------------------------------
# Stage: deps — install all workspace deps
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /repo

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
WORKDIR /repo

COPY --from=deps /repo/node_modules                  ./node_modules
COPY --from=deps /repo/apps/api/node_modules         ./apps/api/node_modules
COPY --from=deps /repo/packages/shared/node_modules  ./packages/shared/node_modules

COPY . .

RUN pnpm --filter @gudy/api exec prisma generate
RUN pnpm --filter @gudy/api build

# -----------------------------------------------------------------------------
# Stage: runner — roda o monorepo inteiro para preservar symlinks do pnpm
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production

RUN apk add --no-cache openssl \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 apiuser

# Copia o monorepo completo com node_modules (preserva symlinks do pnpm)
COPY --from=builder --chown=apiuser:nodejs /repo/node_modules           ./node_modules
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/node_modules  ./apps/api/node_modules
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/dist          ./apps/api/dist
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/prisma        ./apps/api/prisma
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/package.json  ./apps/api/package.json
COPY --from=builder --chown=apiuser:nodejs /repo/packages/shared        ./packages/shared

USER apiuser
WORKDIR /repo/apps/api
EXPOSE 3001

CMD ["node", "dist/index.js"]
