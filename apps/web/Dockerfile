# =============================================================================
# Gudy Money Web — monorepo Dockerfile
# Build context: repo root  →  docker-compose sets: context: .
# Requires next.config.ts:  output: 'standalone'
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /repo
RUN npm install -g pnpm@9 --quiet

# -----------------------------------------------------------------------------
# Stage: deps
# -----------------------------------------------------------------------------
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json  ./packages/shared/
COPY apps/api/package.json         ./apps/api/
COPY apps/web/package.json         ./apps/web/
COPY apps/mobile/package.json      ./apps/mobile/

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage: builder — Next.js standalone build
# -----------------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /repo/node_modules                  ./node_modules
COPY --from=deps /repo/apps/web/node_modules         ./apps/web/node_modules
COPY --from=deps /repo/packages/shared/node_modules  ./packages/shared/node_modules

COPY . .

# Inject public env vars at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

WORKDIR /repo/apps/web
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage: runner — minimal image using Next.js standalone output
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public           ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
