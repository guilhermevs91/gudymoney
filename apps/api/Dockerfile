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

RUN apk add --no-cache openssl \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 apiuser

# Copia codigo compilado, deps da app e schema prisma
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/dist          ./dist
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/node_modules  ./node_modules
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/prisma        ./prisma
COPY --from=builder --chown=apiuser:nodejs /repo/apps/api/package.json  ./package.json

# Instala prisma CLI globalmente (como root, antes de trocar de usuario)
RUN npm install -g prisma@5.22.0 --ignore-scripts

USER apiuser
EXPOSE 3001

CMD ["sh", "-c", "prisma migrate deploy && node dist/index.js"]
