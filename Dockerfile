# codeguru-web — the platform's web tier and backend-for-frontend.
#
# Build (from this directory):
#   docker build -t codeguru-web .
#
# Run against services on the host:
#   docker run --rm -p 4200:4200 \
#     -e SESSION_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
#     -e CODE_COACH_URL=http://host.docker.internal:8000 \
#     -e STUDY_GUIDER_URL=http://host.docker.internal:8010 \
#     -e PAIRPATH_URL=http://host.docker.internal:3001 \
#     -e GAMIFICATION_URL=http://host.docker.internal:3002 \
#     codeguru-web
#
# ── No build arguments, deliberately ────────────────────────────────────────
# Every value this app reads is server-side and read at RUNTIME, so one image
# is valid in every environment. That is only true because there is nothing to
# inline: a NEXT_PUBLIC_* value is baked in at build time, which would mean an
# image per environment and a rebuild to change a URL.
#
# NEXT_PUBLIC_PAIR_WS_URL is the single exception in .env.example, and it is
# meant to be UNSET in a deployed environment - the load balancer routes
# /pair-ws/* to PairPath and the browser connects same-origin. So it is not
# passed here either.

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# package.json AND the lockfile, so `npm ci` is reproducible. Copied alone so
# this layer survives every change that does not touch dependencies.
COPY package.json package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Off in an image build: it phones home during the build, which fails or hangs
# on a network-restricted builder.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── run ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root. The default node image runs as root, and nothing this server does
# needs it.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: 'standalone'` produces a server plus only the modules it traced.
# static/ and public/ are NOT included in it - Next expects them to be served
# alongside, and leaving them out yields a site with no CSS and no JS, which
# looks like a broken build rather than a missing COPY.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# 4200 to match the dev server and the team's existing .env files. The
# standalone server reads PORT and HOSTNAME; HOSTNAME must be 0.0.0.0 or it
# binds to localhost inside the container and the port mapping reaches nothing.
ENV PORT=4200
ENV HOSTNAME=0.0.0.0
EXPOSE 4200

CMD ["node", "server.js"]
