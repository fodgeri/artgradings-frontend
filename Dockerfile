# syntax=docker/dockerfile:1.7

# ---- deps: install node_modules ----
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: bake the Next bundle ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time only. Next.js inlines NEXT_PUBLIC_* into the client bundle, so
# these are baked into the image and are public by definition. Server-side
# secrets (SUPABASE_SECRET_KEY, R2_*, STRIPE_SECRET_KEY, FedEx creds)
# must NEVER appear here — they are runtime env, set in Coolify.
# Args for services not yet built are declared now; an unset ARG is an empty
# string and is harmless.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG GIT_SHA

# SENTRY_AUTH_TOKEN is deliberately NOT an ARG. It is a real credential (it can
# read and write releases for the org), and `cache-to: type=gha,mode=max` in CI
# exports intermediate builder layers — including their ENV metadata — to the
# Actions cache. It is passed as a BuildKit secret instead (see the build step
# below and `secrets:` in .github/workflows/build-and-push.yml), which is
# mounted for the duration of one RUN and never written to a layer.

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    NEXT_PUBLIC_GIT_SHA=$GIT_SHA \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1 \
    NODE_OPTIONS=--max-old-space-size=6144

# The token is optional: with no `secrets:` entry the mount is simply absent,
# SENTRY_AUTH_TOKEN stays empty, and the Sentry plugin skips source map upload
# instead of failing the build. That is what a local `docker build` does.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build

# ---- runner: lean prod image ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# --ingroup is load-bearing: without it adduser drops nextjs into `nogroup`,
# and the `--chown=nextjs:nodejs` copies below would set a group the runtime
# user is not a member of.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# .next/standalone already contains a minimal server.js + the node_modules it
# needs. public/ and .next/static are not included by default and must be
# copied alongside it, or every asset 404s.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
