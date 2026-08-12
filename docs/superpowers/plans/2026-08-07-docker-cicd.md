# Docker & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `artgradings-frontend` as a containerized image built by CI on every push to `main`, pushed to GHCR, and deployed to the netcup production host — with the switch to a two-environment/promotion model already designed in.

**Architecture:** A three-stage Dockerfile turns the Next.js standalone output into a lean non-root image. GitHub Actions on a self-hosted runner lints, typechecks and builds every PR; pushes to `main` build and push `prod-<sha>` + `prod-latest` to GHCR and optionally trigger a Coolify redeploy. Deployment is gated on a repo variable rather than hardcoded, so closing the gate at launch is a config change. Phase 2 (a `develop` branch + test environment + promotion workflow) is purely additive.

**Tech Stack:** Next.js 16.3 (App Router, `output: 'standalone'`), React 19.2, TypeScript strict, next-intl, Node 24, Docker + BuildKit, GitHub Actions (self-hosted), GHCR, Coolify on netcup.

**Source spec:** `docs/superpowers/specs/2026-08-07-docker-cicd-design.md`. Read §2.1 (why there is no image-promotion problem), §2.2 (the auto-deploy switch) and §2.4 (build args vs. runtime env) before starting — they explain decisions this plan only executes.

## Global Constraints

- **Node 24 everywhere.** `node:24-alpine` in the Dockerfile, `node-version: 24` in every `setup-node`, `"engines": { "node": ">=24.0.0", "npm": ">=10.0.0" }` in `package.json`.
- **Build args are `NEXT_PUBLIC_*` only**, plus `SENTRY_ORG`, `SENTRY_PROJECT`, `GIT_SHA`. `SENTRY_AUTH_TOKEN` is **not** a build arg — it is a credential and is passed as a **BuildKit secret mount** (`secrets:` in `docker/build-push-action` + `RUN --mount=type=secret`); see Task 8. Every other secret (`SUPABASE_SERVICE_ROLE_KEY`, `R2_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MEILISEARCH_MASTER_KEY`, FedEx credentials) is **runtime env set in Coolify, never a build arg**. A build arg is baked into image layers and is readable by anyone who can pull the image.
- **Image tags are `prod-<sha>` and `prod-latest`** from the first build. Do not use `latest`, `main`, or an unprefixed SHA — phase 2 adds `test-*` alongside these and nothing should need renaming.
- **Registry:** `ghcr.io/<owner>/artgradings-frontend`. Always derive the owner from `${{ github.repository_owner }}`, never hardcode it.
- **All runners:** `runs-on: [self-hosted, linux, x64]`.
- **Every workflow sets** `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` at the top level and a `timeout-minutes` on every job.
- **No `cache: npm`** in `setup-node` steps. `~/.npm` persists on the self-hosted box between runs; the remote GHA cache would re-upload the tree every run.
- **No user-facing strings in code.** Per `CLAUDE.md`, all copy lives in `messages/*.json`. Nothing in this plan adds UI, but the health endpoint returns machine-readable JSON only — it is not user-facing copy and correctly stays out of the message files.
- **Never commit real credentials.** `.env*` stays gitignored except `.env.example`, which contains redacted placeholders only.

## Verification approach — read this before Task 1

**This repo has no test runner.** There is no vitest, no jest, no Playwright; `package.json` has no `test` script. Adding one is M8 scope and explicitly out of scope here.

Infrastructure is therefore verified by **executable commands with exact expected output**, not by unit tests. Every task below follows the same rhythm as a TDD cycle:

1. Run the check and watch it **fail** for the expected reason.
2. Make the change.
3. Run the same check and watch it **pass**.
4. Commit.

**Order matters: always `npm run build` before `npx tsc --noEmit`.** Next 16
generates `LayoutProps`, `PageProps` and route types into `.next/types/` during
the build. Running `tsc` on a tree with no `.next/` fails with
`Cannot find name 'LayoutProps'` in `app/[locale]/layout.tsx` — a tooling
artifact, not a code error. This applies to every verification step below and to
the CI workflow in Task 5.

Do not skip step 1. A check you never saw fail is a check you have not verified — a `grep` with a typo passes silently against anything, and a health endpoint that was already returning 200 from a stale container tells you nothing.

## Before you start

- [ ] Confirm Docker is running and BuildKit is available: `docker buildx version` → prints a version.
- [ ] Confirm the local Node version is 24: `node --version` → `v24.x.x`.
- [ ] Create a working branch off `main`:

```bash
git checkout main && git pull --ff-only
git checkout -b feat/docker-cicd
```

- [ ] Install dependencies (this repo has no `node_modules` checked out yet):

```bash
npm ci
```

Expected: completes without error. `npm ci` requires `package-lock.json`, which is present.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | Modify | Node/npm version floor; `@types/node` major bump |
| `next.config.ts` | Modify | Add `output: 'standalone'`; later wrapped by `withSentryConfig` |
| `Dockerfile` | Create | Three-stage build: dependency install → Next build → lean non-root runtime |
| `.dockerignore` | Create | Keep build context small; keep `docs/` and `.env*` out of the image |
| `app/api/health/route.ts` | Create | Liveness + deployed-SHA echo. The contract Coolify and every rollback depends on |
| `.env.example` | Create | Documents every env var, split by build-time vs runtime |
| `.gitignore` | Modify | Un-ignore `.env.example` |
| `.github/workflows/ci.yml` | Create | Lint, typecheck, build on every PR and push |
| `.github/workflows/build-and-push.yml` | Create | Build image → GHCR → conditional Coolify deploy |
| `.github/workflows/db-migrate-prod.yml` | Create | Supabase migration dry-run on PR, apply on merge |
| `.github/workflows/ai-review.yml` | Create | Multi-model PR review on the self-hosted runner |
| `opencode.json`, `.opencode/agents/reviewer.md` | Create | Reviewer agent definition and permissions |
| `sentry.{client,server,edge}.config.ts` | Create | Sentry init per runtime |
| `docs/deployment/CICD_PIPELINE.md` | Create | The pipeline as built, plus the phase-2 migration |
| `docs/deployment/ROLLBACK.md` | Create | Retag-and-redeploy, and the snapshot last resort |
| `CLAUDE.md` | Modify | Add Git Workflow & CI/CD section; fix the stale hosting row |

Tasks 1–7 are the phase-1 pipeline and are independent of modules M1–M8. Tasks 8–11 are the selected extras and each carries an external prerequisite; **Task 9 and Task 10 are blocked until M0 creates `supabase/`**.

---

## Task 1: Node 24 baseline

Establishes the version floor everything else assumes. Doing this first means the Dockerfile's `node:24-alpine` matches what you just proved the app builds under, rather than being a leap of faith.

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a repo that builds and typechecks under Node 24, with `engines.node >= 24.0.0` declared. Every later task's `setup-node` and Docker base image depend on this being true.

- [ ] **Step 1: Record the current baseline**

```bash
node --version
npx tsc --noEmit && echo "TYPECHECK OK"
npm run build && echo "BUILD OK"
```

Expected: `v24.x.x`, then `TYPECHECK OK`, then `BUILD OK`. If any of these fail *before* you have changed anything, stop — you have a pre-existing breakage that is not this plan's to fix, and continuing will make it look like the plan caused it.

- [ ] **Step 2: Verify the constraint is currently absent**

```bash
grep -c '"engines"' package.json
grep '"@types/node"' package.json
```

Expected: `0` (no engines field), and `"@types/node": "^20"`. This is the "failing check" — the constraint you are about to add does not exist yet.

- [ ] **Step 3: Add the engines field**

In `package.json`, immediately after the `"private": true,` line:

```json
  "engines": {
    "node": ">=24.0.0",
    "npm": ">=10.0.0"
  },
```

- [ ] **Step 4: Bump the Node types**

```bash
npm i -D @types/node@^24
```

This rewrites `package.json` and `package-lock.json`.

- [ ] **Step 5: Re-run typecheck and build**

```bash
npx tsc --noEmit && echo "TYPECHECK OK"
npm run build && echo "BUILD OK"
```

Expected: both OK.

A major `@types/node` bump sometimes surfaces new strict-mode errors — most often around `Buffer`, `process.env` indexing, or stream types. If `tsc` now reports errors, **fix them properly**; do not add `// @ts-expect-error` and do not revert the bump. The repo is small enough at M0 that any such error is a genuine type improvement. If an error is in a dependency's types rather than this repo's code, `skipLibCheck: true` is already set in `tsconfig.json` and should be suppressing it — investigate rather than widening the config.

- [ ] **Step 6: Verify the constraint now exists**

```bash
grep -A3 '"engines"' package.json
```

Expected: shows `"node": ">=24.0.0"` and `"npm": ">=10.0.0"`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: standardize on Node 24

Adds an engines floor and bumps @types/node to ^24 so the Docker image,
CI runner, and local dev all run the same major version."
```

---

## Task 2: Dockerfile, standalone output, and build context

**Files:**
- Modify: `next.config.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: Node 24 baseline from Task 1.
- Produces: a local image `artgradings:local` that serves the app on port 3000 as uid 1001. Task 3 verifies the health route inside it; Task 6 builds the same Dockerfile in CI and relies on the exact `ARG` names declared here.

- [ ] **Step 1: Prove the build currently produces no standalone output**

```bash
rm -rf .next && npm run build
ls .next/standalone
```

Expected: `ls: cannot access '.next/standalone': No such file or directory`. This is the failure the next step fixes — the Dockerfile's third stage copies from that exact path.

- [ ] **Step 2: Enable standalone output**

Replace the `nextConfig` object in `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server.js plus only the
  // node_modules it actually needs. This is what the Docker runtime stage
  // copies; without it the image build fails at the COPY step.
  output: 'standalone',
};
```

- [ ] **Step 3: Verify standalone output now exists**

```bash
rm -rf .next && npm run build
ls .next/standalone/server.js
```

Expected: prints `.next/standalone/server.js`.

- [ ] **Step 4: Create `.dockerignore`**

Write this **before** the Dockerfile. `COPY . .` in the builder stage copies whatever the context contains, and `docs/01-project-estimation.md` is a client-facing commercial document with hour budgets and pricing that must not ship inside an image.

```
# Build artifacts
node_modules
.next
.turbo
out

# Git
.git
.gitignore
.gitattributes

# Docker (don't recursively copy itself)
Dockerfile
.dockerignore

# Local env — we use build args and runtime env, never baked .env files
.env
.env.*
!.env.example

# Docs — includes the client-facing estimation document
README.md
docs
*.md

# Editor / OS
.vscode
.idea
.DS_Store
Thumbs.db

# Tooling caches
.eslintcache
coverage
playwright-report
test-results

# Project-local agent / scratch dirs
.claude
.superpowers
skills-lock.json
```

- [ ] **Step 5: Create the `Dockerfile`**

```dockerfile
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
# secrets (SUPABASE_SERVICE_ROLE_KEY, R2_*, STRIPE_SECRET_KEY, FedEx creds)
# must NEVER appear here — they are runtime env, set in Coolify.
# Args for services not yet built are declared now; an unset ARG is an empty
# string and is harmless.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG GIT_SHA

# SENTRY_AUTH_TOKEN is deliberately NOT an ARG. It is a real credential (it can
# read and write releases for the org), and `cache-to: type=gha,mode=max` in CI
# exports intermediate builder layers — including their ENV metadata — to the
# Actions cache. When Sentry lands, pass it with a BuildKit secret mount, which
# is never persisted to a layer:
#   RUN --mount=type=secret,id=sentry_auth_token \
#       SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) npm run build
# and `secrets:` (not `build-args:`) in docker/build-push-action.

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    NEXT_PUBLIC_GIT_SHA=$GIT_SHA \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1 \
    NODE_OPTIONS=--max-old-space-size=6144

RUN npm run build

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
```

Two notes on things deliberately absent:

- **No `HEALTHCHECK` instruction.** Coolify polls `/api/health` over HTTP, which is a stronger signal than a self-assertion from inside the container.
- **`NODE_OPTIONS=--max-old-space-size=6144` is only on the builder stage.** It applies to the build running on the CI runner, not to the netcup box. The runtime stage sets no heap flag on purpose — a Next standalone server idles at roughly 150–300 MB and forcing a 6 GB heap ceiling on an 8 GB host would be actively harmful.

- [ ] **Step 6: Build the image**

```bash
docker build -t artgradings:local --build-arg GIT_SHA=$(git rev-parse HEAD) .
```

Expected: completes, ending with `naming to docker.io/library/artgradings:local`.

- [ ] **Step 7: Run it and verify the app serves**

```bash
docker run --rm -d -p 3000:3000 --name ag-test artgradings:local
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Expected: `200` (or `307` — the locale proxy redirecting `/` is also a success signal; it proves the app and its middleware are running).

- [ ] **Step 8: Verify it runs as a non-root user**

```bash
docker inspect --format '{{.Config.User}}' artgradings:local
docker exec ag-test id
```

Expected: `nextjs`, then `uid=1001(nextjs) gid=1001(nodejs)`. A container running as root here would be a real finding, not a nitpick — this image is internet-facing.

- [ ] **Step 9: Verify no secret values are baked into the layers**

```bash
docker history --no-trunc artgradings:local | grep -iE 'SENTRY_AUTH_TOKEN=[^ ]|SERVICE_ROLE|SECRET_KEY' || echo "NO SECRETS IN LAYERS"
```

Expected: `NO SECRETS IN LAYERS`. Run this exact check again in Task 6 after the first real CI build, when the args are actually populated — that is the run where it matters.

- [ ] **Step 10: Verify the estimation doc did not ship**

```bash
docker run --rm artgradings:local ls docs 2>&1 | head -1
```

Expected: an error such as `ls: docs: No such file or directory`. If it lists files, `.dockerignore` is not being applied.

- [ ] **Step 11: Stop the container**

```bash
docker stop ag-test
```

- [ ] **Step 12: Commit**

```bash
git add next.config.ts Dockerfile .dockerignore
git commit -m "feat: containerize the app

Three-stage build on node:24-alpine producing a non-root standalone image.
NEXT_PUBLIC_* are build args (they are inlined into the client bundle);
server-side secrets stay runtime-only. .dockerignore keeps docs/ and .env*
out of the build context."
```

---

## Task 3: Health endpoint

**Files:**
- Create: `app/api/health/route.ts`

**Interfaces:**
- Consumes: the image from Task 2; `NEXT_PUBLIC_GIT_SHA`, set from the `GIT_SHA` build arg.
- Produces: `GET /api/health` → `200` with JSON `{ status: "ok", timestamp: string, sha: string, version: string }`. Task 6 uses it to verify a deploy; `ROLLBACK.md` (Task 7) uses it to confirm which bytes are live; Coolify uses it as the health check for zero-downtime deploys.

- [ ] **Step 1: Prove the endpoint does not exist**

```bash
docker run --rm -d -p 3000:3000 --name ag-test artgradings:local
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
docker stop ag-test
```

Expected: `404`.

- [ ] **Step 2: Create the route**

```ts
import { NextResponse } from 'next/server';

import packageJson from '@/package.json';

/**
 * Application health check.
 *
 * Coolify polls this for zero-downtime deploys, and it is how a deploy or
 * rollback is verified: the `sha` field echoes the git SHA baked in at build
 * time, so `curl .../api/health | jq .sha` proves which bytes are live.
 *
 * Lives outside `app/[locale]/` on purpose — `proxy.ts` excludes `/api` from
 * locale negotiation, so this is reachable at a single canonical URL with no
 * locale prefix.
 *
 * No `export const dynamic` needed: GET Route Handlers have been dynamic by
 * default since Next 15 (see next docs, route.md version history).
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sha: process.env.NEXT_PUBLIC_GIT_SHA ?? 'unknown',
    version: packageJson.version,
  });
}
```

The `@/package.json` import resolves via the `@/*` → `./*` alias in `tsconfig.json`, and typechecks because `resolveJsonModule` is already `true`. No config change is required.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit && echo "TYPECHECK OK"
```

Expected: `TYPECHECK OK`.

- [ ] **Step 4: Rebuild and verify the endpoint responds with the real SHA**

```bash
SHA=$(git rev-parse HEAD)
docker build -t artgradings:local --build-arg GIT_SHA=$SHA .
docker run --rm -d -p 3000:3000 --name ag-test artgradings:local
sleep 3
curl -s http://localhost:3000/api/health
```

Expected: JSON containing `"status":"ok"`, `"version":"0.1.0"`, and a `sha` equal to `$SHA`. If `sha` is `"unknown"`, the build arg did not reach the ENV — check the `ARG`/`ENV` pair in the builder stage.

- [ ] **Step 5: Verify the route is not locale-redirected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
docker stop ag-test
```

Expected: `200`, **not** `307`. A `307` means `proxy.ts` is negotiating a locale for `/api` and the matcher needs checking — Coolify's health check does not follow redirects, so this would silently break every deploy.

- [ ] **Step 6: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat: add /api/health

Returns the git SHA baked in at build time so deploys and rollbacks can be
verified against the running container. Coolify uses it as the health check."
```

---

## Task 4: Environment variable documentation

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the build-arg list from Task 2.
- Produces: the canonical list of environment variables and which side of the build/runtime boundary each falls on. Tasks 6, 8 and 9 populate GitHub secrets and variables from this list.

- [ ] **Step 1: Prove `.env.example` would currently be ignored**

```bash
touch .env.example
git check-ignore -v .env.example
```

Expected: prints a match on the `.env*` rule — meaning the file would be silently uncommittable. That is the bug this task fixes.

- [ ] **Step 2: Un-ignore it**

In `.gitignore`, replace the line `.env*` with:

```
.env*
!.env.example
```

- [ ] **Step 3: Verify it is no longer ignored**

```bash
git check-ignore -v .env.example || echo "NOT IGNORED"
```

Expected: `NOT IGNORED`.

- [ ] **Step 4: Write `.env.example`**

Redacted placeholders only — never a real credential, including one you believe is expired or test-only.

```bash
# ─────────────────────────────────────────────────────────────────────────────
# BAKED AT BUILD TIME (passed as Docker build args)
#
# Next.js inlines every NEXT_PUBLIC_* value into the client bundle, so these
# are public by definition and are visible to anyone who can pull the image.
# They also make the image environment-specific: an image built with test
# values IS a test image and must never be retagged for production.
# ─────────────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_or_publishable_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
NEXT_PUBLIC_SENTRY_DSN=

# Sentry sourcemap upload — build-time only, not shipped in the bundle.
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# ─────────────────────────────────────────────────────────────────────────────
# RUNTIME ONLY (set in Coolify — NEVER a build arg)
#
# Passing any of these as a build arg bakes them into the image layers, where
# they are readable by anyone who can pull it. That is a credential leak
# regardless of how the container is later run.
# ─────────────────────────────────────────────────────────────────────────────
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
MEILISEARCH_HOST=
MEILISEARCH_MASTER_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
FEDEX_ACCOUNT_NUMBER=
```

- [ ] **Step 5: Verify no real secret is about to be committed**

```bash
grep -nE '(sk_live|sk_test_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}|sb_secret)' .env.example || echo "NO REAL SECRETS"
```

Expected: `NO REAL SECRETS`.

- [ ] **Step 6: Commit**

```bash
git add .env.example .gitignore
git commit -m "docs: add .env.example with the build-vs-runtime boundary

Documents which variables are baked into the image (and therefore public)
and which must only ever be set as runtime env in Coolify."
```

---

## Task 5: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Node 24 from Task 1; the `lint` and `build` scripts already in `package.json`.
- Produces: a required status check named `lint-typecheck-build` on every PR and push to `main`.

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"

jobs:
  lint-typecheck-build:
    # Self-hosted (geri-mint) — does not consume GitHub Actions minutes.
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          # No `cache: npm` on self-hosted: ~/.npm persists on the box between
          # runs (the runner wipes only _work), so npm ci already hits a warm
          # local cache. The remote GHA cache would re-upload the tree each run.

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      # Build MUST run before the type check. Next 16 generates types into
      # .next/types/ during the build (LayoutProps, PageProps, route types).
      # On a clean checkout there is no .next/, so `tsc --noEmit` first fails
      # with "Cannot find name 'LayoutProps'" in app/[locale]/layout.tsx.
      - name: Build
        run: npm run build
        env:
          NODE_OPTIONS: --max-old-space-size=6144
          # Placeholders, not real credentials. CI must never need production
          # secrets to prove the code compiles — that way a hostile PR has
          # nothing to exfiltrate from this job.
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk_test_placeholder
          NEXT_PUBLIC_SENTRY_DSN: ""

      - name: Type check
        run: npx tsc --noEmit
        env:
          NODE_OPTIONS: --max-old-space-size=6144
```

**Job name is `lint-build-typecheck`**, reflecting that order.

- [ ] **Step 2: Validate the YAML parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 3: Commit and push the branch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck and build workflow"
git push -u origin feat/docker-cicd
```

- [ ] **Step 4: Open a PR and confirm CI runs green**

```bash
gh pr create --base main --title "Docker + CI/CD pipeline" --body "Implements docs/superpowers/specs/2026-08-07-docker-cicd-design.md"
gh pr checks --watch
```

Expected: `lint-typecheck-build` passes.

If the job never starts and sits queued, the self-hosted runner is not registered to this repo with the labels `self-hosted, linux, x64` — see the prerequisites in §6 of the spec. Do not work around this by switching to `ubuntu-latest`; fix the runner registration.

- [ ] **Step 5: Prove the check actually fails on bad code**

A green check that cannot go red is not a check. Verify it once, now:

```bash
echo "const unused: string = 123;" >> app/[locale]/page.tsx
git commit -am "test: deliberate type error"
git push
gh pr checks --watch
```

Expected: `lint-typecheck-build` **fails** at the type check step.

- [ ] **Step 6: Revert the deliberate error**

```bash
git revert --no-edit HEAD
git push
gh pr checks --watch
```

Expected: green again.

---

## Task 6: Build and push to GHCR

**Files:**
- Create: `.github/workflows/build-and-push.yml`

**Interfaces:**
- Consumes: the `Dockerfile` and its exact `ARG` names from Task 2; `/api/health` from Task 3.
- Produces: `ghcr.io/<owner>/artgradings-frontend:prod-<sha>` and `:prod-latest` on every push to `main`, plus a Coolify deploy conditional on `vars.AUTO_DEPLOY`.

**External prerequisites — complete these before Step 1:**

- [ ] GHCR package write access: repo Settings → Actions → General → Workflow permissions → **Read and write**.
- [ ] GitHub environment `production` created (Settings → Environments). **Do not add a required reviewer yet** — that lands at M8 and would only slow the pre-launch loop.
- [ ] Environment variables on `production`: `NEXT_PUBLIC_APP_URL`, `AUTO_DEPLOY=true`. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SENTRY_DSN` as each service comes online; an unset variable resolves to an empty string and the build still succeeds.
- [ ] Environment secrets on `production`: `COOLIFY_WEBHOOK_URL`, `COOLIFY_TOKEN`.
- [ ] Coolify on netcup: application created, source = Docker image `ghcr.io/<owner>/artgradings-frontend:prod-latest`, port 3000, health check path `/api/health`.

- [ ] **Step 1: Create the workflow**

```yaml
name: Build and Push

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

concurrency:
  group: build-${{ github.ref }}
  # Do NOT cancel in progress: every commit deserves its own immutable image,
  # so that any past SHA can be redeployed for a rollback.
  cancel-in-progress: false

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"

jobs:
  build-and-push:
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 40
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/artgradings-frontend
          # Environment-prefixed from day one so phase 2 can add test-* tags
          # alongside these without renaming anything.
          tags: |
            type=raw,value=prod-${{ github.sha }}
            type=raw,value=prod-latest

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          # Public values only. Server-side secrets are runtime env in Coolify.
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
            NEXT_PUBLIC_APP_URL=${{ vars.NEXT_PUBLIC_APP_URL }}
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${{ vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}
            NEXT_PUBLIC_SENTRY_DSN=${{ vars.NEXT_PUBLIC_SENTRY_DSN }}
            GIT_SHA=${{ github.sha }}

      # The single switch between the pre-launch and post-launch pipeline.
      # Pre-launch: AUTO_DEPLOY=true, merges go live immediately.
      # At M8 launch: set AUTO_DEPLOY=false and revoke the Coolify API token —
      # deployment becomes a human clicking Deploy in Coolify. No workflow edit.
      - name: Trigger Coolify deploy
        if: success() && vars.AUTO_DEPLOY == 'true'
        run: |
          curl -fsSL --max-time 30 --request GET \
            --header "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            "${{ secrets.COOLIFY_WEBHOOK_URL }}"

      - name: Deploy summary
        if: success()
        run: |
          {
            echo "## Image published"
            echo ""
            echo "**Tags:** \`prod-${GITHUB_SHA}\`, \`prod-latest\`"
            echo "**Auto-deploy:** \`${{ vars.AUTO_DEPLOY }}\`"
            echo ""
            echo "Verify: \`curl https://<domain>/api/health | jq .sha\` should return \`${GITHUB_SHA}\`"
          } | tee -a "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 2: Validate the YAML parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-and-push.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 3: Commit, merge the PR, and watch the first build**

```bash
git add .github/workflows/build-and-push.yml
git commit -m "ci: build and push images to GHCR

Tags prod-<sha> and prod-latest on every main push. The Coolify deploy step
is gated on vars.AUTO_DEPLOY so closing the gate at launch is a variable
change rather than a workflow edit."
git push
gh pr merge --merge
gh run watch
```

Expected: `Build and Push` completes successfully.

- [ ] **Step 4: Verify the image is in GHCR with both tags**

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
SHA=$(git rev-parse main)
docker pull ghcr.io/$OWNER/artgradings-frontend:prod-$SHA
docker pull ghcr.io/$OWNER/artgradings-frontend:prod-latest
```

Expected: both pull successfully.

- [ ] **Step 5: Re-run the secret-leak check against a real build**

This is the run that matters — Task 2's check ran with empty args.

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
docker history --no-trunc ghcr.io/$OWNER/artgradings-frontend:prod-latest \
  | grep -iE 'SERVICE_ROLE|STRIPE_SECRET|R2_SECRET|SENTRY_AUTH_TOKEN=[^ ]' \
  || echo "NO SECRETS IN LAYERS"
```

Expected: `NO SECRETS IN LAYERS`. If anything matches, treat the credential as compromised: rotate it, then delete the package version from GHCR.

- [ ] **Step 6: Verify the deployed SHA on netcup**

```bash
curl -s https://<your-domain>/api/health | jq .
```

Expected: `sha` equals the SHA from Step 4. If it returns the previous SHA, Coolify has not finished pulling — wait and retry before investigating.

- [ ] **Step 7: Test the auto-deploy switch once, deliberately**

Do this now, while nothing is at stake. Discovering that the switch does not work during the launch window is the failure mode this step exists to prevent.

1. Set `AUTO_DEPLOY=false` in the `production` environment.
2. Push any trivial commit to `main`.
3. Watch the run: `gh run watch`.

Expected: the image builds and pushes, and the `Trigger Coolify deploy` step is **skipped**. `/api/health` still reports the *old* SHA — proving build and release are genuinely separate.

4. Set `AUTO_DEPLOY=true` again and confirm the next push deploys.

---

## Task 7: Deployment documentation

**Files:**
- Create: `docs/deployment/CICD_PIPELINE.md`
- Create: `docs/deployment/ROLLBACK.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–6.
- Produces: the operational runbook. `ROLLBACK.md` is the document someone reads under pressure — write it for a reader who is stressed and not you.

- [ ] **Step 1: Verify the stale hosting claim in `CLAUDE.md`**

```bash
grep -n "Hetzner\|Contabo" CLAUDE.md
```

Expected: matches on the stack table row and the Meilisearch row. Both are wrong now — the host is netcup.

- [ ] **Step 2: Write `docs/deployment/CICD_PIPELINE.md`**

Cover, in this order:

1. **The flow today** — `main` push → CI → build → GHCR `prod-<sha>` + `prod-latest` → Coolify on netcup (conditional on `AUTO_DEPLOY`).
2. **Why images are environment-flavored** — copy the reasoning from §2.1 of the spec. `NEXT_PUBLIC_*` is inlined at build time, so an image built with test values *is* a test image.
3. **The one configuration to never build** — a test environment fed from `main`. That is the single-branch/two-environment trap; phase 2 adds a branch *and* a host, together.
4. **The `AUTO_DEPLOY` switch** — what it does, and the launch checklist: set `false`, revoke the Coolify API token, add a required reviewer to the `production` environment.
5. **The phase-2 migration** — reproduce the seven-step table from §2.3 of the spec.
6. **Where secrets live** — the §2.4 boundary, and the rule that a build arg is public.

- [ ] **Step 3: Write `docs/deployment/ROLLBACK.md`**

Two levers, in strict order of preference:

```markdown
## Lever 1 — Retag a known-good image (preferred)

Fast, surgical, no data implications. The image for every past commit on
`main` is still in GHCR.

1. Find the last good SHA:
   `gh run list --workflow=build-and-push.yml --limit 10`
2. Retag and push:
   ```bash
   OWNER=<owner>; IMG=ghcr.io/$OWNER/artgradings-frontend; SHA=<good-sha>
   docker pull "$IMG:prod-$SHA"
   docker tag  "$IMG:prod-$SHA" "$IMG:prod-latest"
   docker push "$IMG:prod-latest"
   ```
3. Click **Deploy** in Coolify (or fire the webhook if AUTO_DEPLOY is on).
4. Verify: `curl https://<domain>/api/health | jq .sha` returns `<good-sha>`.

## Lever 2 — netcup Copy-On-Write snapshot (last resort)

Restores the WHOLE BOX, including Coolify's own state and anything else
running on it. Everything since the snapshot is lost. Use only when the host
itself is broken, not when a deploy is bad.

## What neither lever rolls back: the database

Supabase is a managed service outside both levers. A code rollback across a
migration that dropped or renamed a column will leave the old code querying a
schema that no longer matches, and it will fail at runtime.

This is why migrations must be backwards-compatible (see the prod migration
checklist): never drop or rename a column in the same release that stops
using it. Split it across two releases so a one-step rollback is always safe.

If a rollback does require a schema change, stop and get the developer — do
not hand-edit production SQL under time pressure.
```

- [ ] **Step 4: Update `CLAUDE.md`**

Fix the hosting row in the stack table:

```markdown
| Hosting | netcup RS 1000 G12 (Coolify) — production; test env added in phase 2 |
```

Fix the Meilisearch row, which also says Hetzner, and append a **Git Workflow & CI/CD** section covering: the single-`main` model for now, that pushes build `prod-*` and deploy when `AUTO_DEPLOY=true`, the build-arg vs runtime-env rule from §2.4, and pointers to the two new documents.

- [ ] **Step 5: Verify no stale host references remain**

```bash
grep -n "Hetzner\|Contabo" CLAUDE.md || echo "NO STALE HOSTS"
```

Expected: `NO STALE HOSTS`.

- [ ] **Step 6: Commit**

```bash
git add docs/deployment CLAUDE.md
git commit -m "docs: add CI/CD and rollback runbooks

Also corrects the stack table, which still claimed Hetzner/Contabo hosting."
```

---

## Task 8: Sentry (optional — confirm with the client first)

**Files:**
- Create: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Modify: `next.config.ts`, `.github/workflows/build-and-push.yml`

**Interfaces:**
- Consumes: the Sentry build args already declared in Task 2's Dockerfile.
- Produces: error reporting, and a Sentry release per deployed SHA.

**Before starting:** Sentry is **not** in the target stack in `CLAUDE.md`. It adds a dependency, a vendor account, and a paid tier as volume grows. Per `CLAUDE.md`, business decisions are client-supplied — confirm error monitoring is wanted and who pays for it before implementing. If the answer is "not now", skip this task; nothing else in the plan depends on it.

**External prerequisites:** Sentry project created; `SENTRY_ORG` and `SENTRY_PROJECT` as environment variables and `SENTRY_AUTH_TOKEN` as an environment secret on `production`; `NEXT_PUBLIC_SENTRY_DSN` as an environment variable.

- [ ] **Step 1: Install**

```bash
npm i @sentry/nextjs
```

- [ ] **Step 2: Create the three config files**

`sentry.client.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  release: process.env.NEXT_PUBLIC_GIT_SHA,
});
```

`sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  release: process.env.NEXT_PUBLIC_GIT_SHA,
});
```

`sentry.edge.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  release: process.env.NEXT_PUBLIC_GIT_SHA,
});
```

- [ ] **Step 3: Wrap the Next config**

In `next.config.ts`, keep `withNextIntl` innermost:

```ts
import { withSentryConfig } from '@sentry/nextjs';

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
```

- [ ] **Step 4: Verify the build still succeeds**

```bash
npm run build && npx tsc --noEmit && echo "BUILD OK"
```

Expected: `BUILD OK`. Build before typecheck — see the verification note above. With no `SENTRY_AUTH_TOKEN` set locally, sourcemap upload is skipped with a warning — that is correct, not an error.

- [ ] **Step 5: Wire the Sentry credentials into the workflow**

`SENTRY_ORG` and `SENTRY_PROJECT` are identifiers — extend `build-args`:

```yaml
            SENTRY_ORG=${{ vars.SENTRY_ORG }}
            SENTRY_PROJECT=${{ vars.SENTRY_PROJECT }}
```

`SENTRY_AUTH_TOKEN` is a credential and **must not** be a build arg — CI uses
`cache-to: type=gha,mode=max`, which exports intermediate builder layers and
their ENV metadata to the Actions cache. Add a sibling `secrets:` key instead:

```yaml
          secrets: |
            sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}
```

and consume it in the Dockerfile's build step, where it never lands in a layer:

```dockerfile
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build
```

- [ ] **Step 6: Add release marking after the build step**

```yaml
      - name: Mark Sentry release
        if: success()
        env:
          SENTRY_ORG: ${{ vars.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
        run: |
          npx @sentry/cli releases new "$GITHUB_SHA"
          # --ignore-missing: actions/checkout shallow-clones (depth 1), so the
          # previous release's commit is unreachable. Without this the step
          # fails instead of falling back to default commit attribution.
          npx @sentry/cli releases set-commits "$GITHUB_SHA" --auto --ignore-missing
          npx @sentry/cli releases finalize "$GITHUB_SHA"
          npx @sentry/cli releases deploys "$GITHUB_SHA" new -e production
```

- [ ] **Step 7: Commit, push, and verify the release appears**

```bash
git add sentry.*.config.ts next.config.ts package.json package-lock.json .github/workflows/build-and-push.yml
git commit -m "feat: add Sentry error monitoring and release tracking"
git push
gh run watch
```

Expected: the run succeeds, and the SHA appears under Releases in the Sentry dashboard with a `production` deploy attached.

---

## Task 9: Supabase migration workflow (blocked until `supabase/` exists)

**Files:**
- Create: `.github/workflows/db-migrate-prod.yml`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: a `supabase/` directory with `migrations/`, created by M0.
- Produces: a migration dry-run comment on every PR touching `supabase/**`, and automatic application on merge.

**Blocked:** this task does nothing until M0 creates the Supabase project and `supabase/` directory. Landing it early is still worthwhile — it means the very first migration is governed rather than applied by hand — but it cannot be verified until then. Do not mark it complete on an empty `supabase/`.

**External prerequisites:** Supabase project created; repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`.

- [ ] **Step 1: Create the workflow**

```yaml
name: DB Migrate (Prod)

on:
  workflow_dispatch:
  pull_request:
    branches: [main]
    paths:
      - 'supabase/migrations/**'
      - 'supabase/functions/**'
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'
      - 'supabase/functions/**'

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"

jobs:
  dry-run:
    if: github.event_name == 'pull_request'
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Dry-run migration
        id: dry_run
        run: |
          OUTPUT=$(supabase db push --dry-run 2>&1) || true
          echo "output<<EOF" >> "$GITHUB_OUTPUT"
          echo "$OUTPUT" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Comment PR with migration diff
        uses: actions/github-script@v7
        with:
          script: |
            const output = `${{ steps.dry_run.outputs.output }}`;
            const body = [
              '### Prod DB Migration Dry Run',
              '',
              '```sql',
              output,
              '```',
              '',
              '#### Review checklist',
              '- [ ] Backwards-compatible (no column drops or renames in the same release that stops using them — see docs/deployment/ROLLBACK.md)',
              '- [ ] RLS policies correct — a user must only ever see their own orders',
              '- [ ] Pop Report reads only finalized grades',
              '- [ ] Indexes added for new query patterns',
              '',
              '*Migrations apply to **production** on merge.*',
            ].join('\n');
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => c.body.includes('Prod DB Migration Dry Run'));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

  migrate:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install dependencies
        run: npm ci

      - name: Link project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Apply migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Deploy Edge Functions
        # Every function under supabase/functions/ deploys automatically so new
        # ones ship without editing this list. Directories starting with "_"
        # (e.g. _shared) are shared libraries, not deployable functions.
        run: |
          for fn in supabase/functions/*/; do
            [ -d "$fn" ] || continue
            name=$(basename "$fn")
            case "$name" in _*) continue ;; esac
            echo "::group::Deploying $name"
            supabase functions deploy "$name" --no-verify-jwt
            echo "::endgroup::"
          done
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Check for type drift
        run: |
          npx supabase gen types typescript --project-id ${{ secrets.SUPABASE_PROJECT_REF }} > lib/supabase/database.types.ts
          if ! git diff --quiet lib/supabase/database.types.ts; then
            echo "::warning::database.types.ts is out of date. Regenerate locally and commit."
            git diff --stat lib/supabase/database.types.ts
          fi
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

Note the types path is `lib/supabase/database.types.ts` — **not** `src/lib/...`. This repo has no `src/` directory.

- [ ] **Step 2: Add Supabase CLI state to `.dockerignore`**

Append:

```
# Supabase CLI local state — migrations run server-side, not in the image
supabase/.temp
supabase/.branches
```

- [ ] **Step 3: Validate the YAML parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/db-migrate-prod.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/db-migrate-prod.yml .dockerignore
git commit -m "ci: add Supabase migration workflow

Dry-run comment on PRs touching supabase/**, apply on merge, deploy edge
functions, warn on generated-type drift."
```

- [ ] **Step 5: Verify once `supabase/` exists (deferred to M0)**

Open a PR adding a trivial migration. Expected: a `Prod DB Migration Dry Run` comment appears with the SQL and the checklist. Merge it. Expected: the `migrate` job applies it and the change is visible in the Supabase dashboard.

---

## Task 10: Migration gate on the build (requires Task 9)

**Files:**
- Modify: `.github/workflows/build-and-push.yml`

**Interfaces:**
- Consumes: `db-migrate-prod.yml` from Task 9.
- Produces: a `wait-for-migrations` job that `build-and-push` depends on.

Without this, a push whose code expects a new column can be built and deployed before the migration that adds it has finished. In phase 1 that lands directly in production.

**External prerequisite:** `gh` and `jq` installed on the self-hosted runner (`sudo apt install -y jq`).

- [ ] **Step 1: Add the gate job above `build-and-push`**

```yaml
jobs:
  # If this same commit triggered db-migrate-prod, block the build until that
  # workflow finishes successfully. If it didn't trigger, this is a no-op.
  wait-for-migrations:
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 35   # backstop; the poll loop self-limits to ~30m
    steps:
      - name: Wait for DB Migrate on this SHA, if any
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SHA: ${{ github.sha }}
          REPO: ${{ github.repository }}
        run: |
          set -euo pipefail
          WF="db-migrate-prod.yml"
          ATTEMPTS=60        # 60 * 30s = 30 minutes max
          for i in $(seq 1 $ATTEMPTS); do
            run_json=$(gh api "repos/$REPO/actions/workflows/$WF/runs?head_sha=$SHA&per_page=1" --jq '.workflow_runs[0] // empty')
            if [[ -z "$run_json" ]]; then
              echo "No $WF run for SHA $SHA — proceeding."
              exit 0
            fi
            status=$(echo "$run_json" | jq -r '.status')
            conclusion=$(echo "$run_json" | jq -r '.conclusion')
            echo "[$i/$ATTEMPTS] $WF status=$status conclusion=$conclusion"
            case "$status" in
              completed)
                if [[ "$conclusion" == "success" ]]; then
                  echo "Migrations succeeded — proceeding."
                  exit 0
                fi
                echo "::error::$WF finished with conclusion=$conclusion. Aborting build."
                exit 1
                ;;
              *)
                sleep 30
                ;;
            esac
          done
          echo "::error::Timed out after 30m waiting for $WF."
          exit 1
```

- [ ] **Step 2: Make the build depend on it**

Add to the `build-and-push` job, directly under its name:

```yaml
    needs: wait-for-migrations
```

- [ ] **Step 3: Add `actions: read` permission**

The gate reads other workflow runs. Update the top-level block:

```yaml
permissions:
  contents: read
  packages: write
  actions: read
```

- [ ] **Step 4: Verify `gh` and `jq` are on the runner**

```bash
gh --version && jq --version
```

Run this on the runner box. Expected: both print versions. If `jq` is missing the gate fails on every push with a cryptic error.

- [ ] **Step 5: Validate and commit**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-and-push.yml')); print('YAML OK')"
git add .github/workflows/build-and-push.yml
git commit -m "ci: block image build until migrations for the SHA succeed"
```

- [ ] **Step 6: Verify the gate actually blocks (deferred to M0)**

Push a deliberately invalid migration. Expected: `db-migrate-prod` fails, `wait-for-migrations` aborts with the error annotation, and `build-and-push` never runs. Then revert.

---

## Task 11: Multi-model AI PR review

**Files:**
- Create: `.github/workflows/ai-review.yml`
- Create: `opencode.json`
- Create: `.opencode/agents/reviewer.md`

**Interfaces:**
- Consumes: the self-hosted runner with OpenCode installed and authenticated.
- Produces: one PR comment per model leg, each headed `## 🤖 Review by <label>`.

**External prerequisites:** OpenCode installed on the runner, and the runner user logged in — `~/.local/share/opencode/auth.json` must exist. Copy `opencode.json` and `.opencode/agents/reviewer.md` from `/home/geri/work/cardstrade/cardstrade-frontend/` and adjust any project-specific references.

**Two hardening steps below are not optional.** Read the comments before deciding anything looks redundant.

- [ ] **Step 1: Copy the reviewer config from the reference repo**

```bash
cp /home/geri/work/cardstrade/cardstrade-frontend/opencode.json .
mkdir -p .opencode/agents
cp /home/geri/work/cardstrade/cardstrade-frontend/.opencode/agents/reviewer.md .opencode/agents/
```

- [ ] **Step 2: Confirm the reviewer agent cannot write to the repo**

```bash
grep -n "edit" .opencode/agents/reviewer.md opencode.json
```

Expected: an `edit: deny` (or equivalent) permission. The reviewer runs on your machine against untrusted PR branches; it must be read-only. If this is missing, add it before continuing.

- [ ] **Step 3: Create the workflow**

```yaml
name: AI Code Review (self-hosted)

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

concurrency:
  group: ai-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: [self-hosted, linux, x64]
    # Hard cap so a leg can never run away. Queue time does not count.
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        include:
          - label: "GLM-5.2 (Z.ai)"
            model: "zai-coding-plan/glm-5.2"
          - label: "Kimi K3 (Kimi for Coding)"
            model: "kimi-for-coding/k3"
          - label: "GPT-5.6 Sol (OpenAI)"
            model: "openai/gpt-5.6-sol"
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # HARDENING 1 — do not skip.
      # Without this, a PR can edit the reviewer's OWN config to remove
      # `edit: deny` and widen bash permissions, then have it execute on our
      # self-hosted runner. Overwrite the agent config with the trusted copy
      # from the PR's base branch. On the bootstrap PR (config not yet on
      # base) this no-ops and uses the PR copy.
      - name: Pin reviewer config to trusted base ref
        run: |
          git fetch --depth=1 origin "${{ github.event.pull_request.base.ref }}" || exit 0
          if git checkout FETCH_HEAD -- .opencode/agents/reviewer.md opencode.json 2>/dev/null; then
            echo "Pinned reviewer config to base ref: ${{ github.event.pull_request.base.ref }}"
          else
            echo "::notice::reviewer config not on base ref yet; using PR version (bootstrap)"
          fi

      # HARDENING 2 — do not skip.
      # Every leg runs as the same user against one large WAL-mode SQLite DB.
      # Three processes starting in the same second contend on it and losers
      # die instantly with "database is locked", silently degrading a 3-model
      # review to 1. Give each leg a private data dir; SYMLINK auth.json (not
      # copy) so a refreshed token is written back to the real file rather
      # than discarded with the temp dir.
      - name: Isolate opencode state for this leg
        run: |
          AUTH="$HOME/.local/share/opencode/auth.json"
          if [ ! -f "$AUTH" ]; then
            echo "::error::opencode auth.json not found at $AUTH — the runner user is not logged in"
            exit 1
          fi
          LEG_DATA="${RUNNER_TEMP}/opencode-data"
          mkdir -p "$LEG_DATA/opencode"
          ln -sfn "$AUTH" "$LEG_DATA/opencode/auth.json"
          echo "XDG_DATA_HOME=$LEG_DATA" >> "$GITHUB_ENV"
          echo "Isolated opencode state at $LEG_DATA (auth.json symlinked)"

      - name: Review with ${{ matrix.label }}
        run: |
          opencode run \
            --agent reviewer \
            --model "${{ matrix.model }}" \
            "You are running as model '${{ matrix.label }}'. Begin your posted PR comment with the header line '## 🤖 Review by ${{ matrix.label }}'. Review pull request #${{ github.event.pull_request.number }} in repo ${{ github.repository }}. The PR branch is checked out. Run 'gh pr diff ${{ github.event.pull_request.number }}' to get the full diff, read every changed file plus the surrounding code needed to verify findings, then follow your reviewer instructions to post exactly one comment with 'gh pr comment'."
```

- [ ] **Step 4: Validate the YAML parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ai-review.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 5: Commit and open a test PR**

```bash
git add .github/workflows/ai-review.yml opencode.json .opencode
git commit -m "ci: add multi-model AI PR review"
git push
gh pr create --base main --title "Test AI review" --body "Verifying the review workflow"
gh pr checks --watch
```

- [ ] **Step 6: Verify all three legs survived**

Expected: **three** comments on the PR, one per model, each with its own header line.

If only one or two appear, the isolation step in Hardening 2 is not working — check the job logs for `database is locked`. Do not accept a degraded review as normal; that failure is silent by design and is exactly what that step exists to prevent.

---

## Self-review

**Spec coverage** — every deliverable maps to a task:

| Spec | Task |
|---|---|
| A1 Dockerfile, A2 standalone, A3 dockerignore | 2 |
| B1 ci.yml | 5 |
| B2 Node 24 | 1 |
| C1 health route | 3 |
| C2 build-and-push | 6 |
| §2.2 AUTO_DEPLOY switch + deliberate test | 6 (Steps 1, 7) |
| D1 Sentry | 8 |
| D2 Supabase migrate | 9 |
| D3 wait-for-migrations | 10 |
| D4 ai-review + both hardening steps | 11 |
| E1 .env.example + .gitignore | 4 |
| E2 CICD_PIPELINE, ROLLBACK, CLAUDE.md | 7 |
| §2.4 build-arg boundary | Global Constraints; enforced in 2 (Step 9) and 6 (Step 5) |

Spec §5 (`promote-to-prod.yml`) is intentionally unimplemented — it is phase-2 work, recorded in the spec so it is designed ahead of launch rather than during it.

**Naming consistency:** the image is `ghcr.io/<owner>/artgradings-frontend` and tags are `prod-<sha>` / `prod-latest` in Tasks 6, 7 and the rollback runbook. The health field is `sha` in Task 3, Task 6 Step 6 and `ROLLBACK.md`. The switch is `vars.AUTO_DEPLOY` compared against the string `'true'` in both Task 6 and the docs. Secret names in Task 4's `.env.example` match the build args in Task 2 and the workflow inputs in Tasks 6, 8 and 9.

**Known deferrals, stated rather than hidden:** Tasks 9 and 10 cannot be verified until M0 creates `supabase/`, and each says so in its own body rather than only here. Task 8 is gated on a client decision about Sentry. Task 11 is gated on OpenCode being installed and authenticated on the runner.
