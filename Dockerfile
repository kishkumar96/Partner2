# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Copy only build inputs (avoid accidentally copying local secrets like .env*)
COPY package*.json ./
COPY next.config.* ./
COPY tsconfig.* ./
COPY postcss.config.* ./
COPY tailwind.config.* ./
COPY eslint.config.* ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src

# Produce a standalone Next.js bundle (see next.config.ts output:'standalone')
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Disable auth requirement during build (auth features are optional)
ENV AUTH_REQUIRE_REDIS=false
RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port the server will listen on inside the container
ENV PORT=3112
ENV HOSTNAME="0.0.0.0"

# Least-privilege user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy entrypoint script for flexible deployment
COPY --from=builder /app/scripts ./scripts
RUN chmod +x ./scripts/docker-entrypoint.sh

# Static public assets
COPY --from=builder /app/public ./public

# Standalone server bundle (includes its own node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static Next.js assets (JS chunks, CSS, images)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3112

# NOTE: The app is served under the /partner2 base-path in production.
# Access it at http://localhost:3112/partner2
CMD ["node", "server.js"]
