# ---- Stage 1: Dependencies ----
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json ./

# Copy package.json for each workspace package
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

# Install all dependencies (npm workspaces need the full lockfile)
RUN npm ci

# ---- Stage 2: Build ----
FROM node:18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules 2>/dev/null || true

# Copy all source files
COPY . .

# Set Next.js telemetry off during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js application
RUN npm run build --workspace apps/web

# ---- Stage 3: Production ----
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only the files needed to run
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy migration files for deploy-time migration runs
COPY --from=builder /app/packages/database/migrations ./packages/database/migrations

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
