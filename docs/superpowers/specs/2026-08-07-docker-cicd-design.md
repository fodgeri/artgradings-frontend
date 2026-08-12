# Docker & CI/CD — Design Spec

**Date:** 2026-08-07
**Status:** Draft — awaiting keep/drop selection
**Reference implementation:** `/home/geri/work/cardstrade/cardstrade-frontend`

---

## 1. Purpose

Give `artgradings-frontend` a containerized build and an automated pipeline from
commit to running container, modeled on the cardstrade setup that already runs on
the same self-hosted runner and registry.

This is **M0 — Foundation & infra** work (`docs/01-project-estimation.md`, 56h).
It is deliberately built before there is an application to deploy, so every later
module (M1–M8) ships through a pipeline that already exists.

**The pipeline is built in two phases.** Phase 1 is what exists today: one branch,
one host. Phase 2 adds a test environment and a promotion gate. The whole point of
§2.3 is that phase 2 is *configuration*, not a rewrite — nothing built in phase 1
gets undone.

---

## 2. Decisions

Numbered **DEC-n** to keep them distinct from the deliverable IDs in §3 (which use
group letters A–E).

| # | Decision | Rationale |
|---|---|---|
| DEC-1 | **Phase 1: single branch `main`, single environment (production on netcup)** | The project is at M0. A second branch with nothing to integrate, and a staging box with nothing to stage, are both overhead. |
| DEC-2 | **Host: netcup RS 1000 G12** (EPYC 9645, 4 dedicated cores, 8 GB DDR5 ECC, 256 GB NVMe), running Coolify | The box that exists. Replaces the Hetzner/Contabo split in the reference repo. ⚠️ `CLAUDE.md`'s stack table still says Hetzner/Contabo — stale, fix in E2. |
| DEC-3 | **Images build on the self-hosted runner** (geri-mint), never on netcup | Keeps an 8 GB production box out of the build path entirely. netcup only pulls and runs. |
| DEC-4 | **GHCR** as the registry, tags `prod-<sha>` / `prod-latest` **from day one** | Environment-prefixed tags now means nothing is renamed when `test-*` joins them in phase 2. |
| DEC-5 | **Node 24** everywhere — Docker image, CI `setup-node`, `package.json` `engines` | cardstrade is inconsistent (Docker 24 / CI 20). One version removes a class of "green in CI, broken in the image" bugs. Requires bumping `@types/node` to `^24`. |
| DEC-6 | **Auto-deploy is a repo variable, not a hardcoded step** | See §2.2. This is the single switch that turns the pre-launch workflow into the post-launch one. |
| DEC-7 | Sentry, Supabase migration workflows, and multi-model AI review are **in scope**; local Meilisearch compose is **out** | Per selection. Sentry carries a caveat — see §3 D1. |

### 2.1 Why there is no image-promotion problem

Next.js inlines every `NEXT_PUBLIC_*` variable into the **client bundle at build
time**. `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` therefore differ between environments
*inside the image*, not just in the container's environment. An image is
environment-flavored the moment it is built.

The trap is the **one-branch, two-environment** configuration: there is only one
build, so promoting it to production means either shipping test-flavored bytes
(the test Supabase project and test Stripe key, silently, with no error) or
rebuilding on promote and losing artifact immutability.

This design never enters that configuration:

- **Phase 1** — one branch, one environment. One flavor. Nothing to promote.
- **Phase 2** — two branches, two environments. `develop` builds test-flavored,
  `main` builds prod-flavored, and promotion is a pure retag of bytes that were
  *already built with production values*.

This is the reason phase 2 adds a branch rather than adding only a host. A test
environment fed from `main` would be the broken configuration.

### 2.2 The auto-deploy switch (DEC-6)

Pre-launch, `main` → build → deploy straight to netcup is correct: there are no
users, and a fast loop is worth more than a gate. At launch that same behaviour
becomes "every merge goes live unreviewed."

So the deploy step is conditional on a repo variable:

```yaml
- name: Trigger Coolify deploy
  if: success() && vars.AUTO_DEPLOY == 'true'
  run: curl -fsSL --max-time 30 -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" "${{ secrets.COOLIFY_WEBHOOK_URL }}"
```

**Pre-launch:** `AUTO_DEPLOY=true`.
**At launch (M8):** set `AUTO_DEPLOY=false` and revoke the Coolify API token on
the host. Deployment becomes a human clicking **Deploy** in Coolify. The image is
already in GHCR either way — build and release are separate events from day one.

Flipping one variable is the whole change. No workflow edit, no redeploy of the
pipeline itself.

### 2.3 Phase 1 → Phase 2 migration

Phase 2 is triggered by whichever comes first: a test environment being
provisioned, or M8 launch.

| | Phase 1 (now) | Phase 2 (later) |
|---|---|---|
| Branches | `main` | `develop` (default) + `main` |
| Environments | `production` (netcup) | `test` + `production` |
| `main` push | build `prod-*`, deploy if `AUTO_DEPLOY` | build `prod-*`, **no deploy** |
| `develop` push | — | build `test-*`, auto-deploy to test |
| Release | merge to `main` | `develop → main` PR, then `Promote to Prod` + manual click |

Concrete steps, all additive:

1. Create `develop` off `main`; make it the default branch.
2. Add `develop` to the branch lists in `ci.yml`, `ai-review.yml`, `db-migrate-*`.
3. `build-and-push.yml`: add `test-*` tags gated on `develop`, gate `prod-*` on `main`.
   The tag names chosen in DEC-4 mean the existing line is untouched.
4. Set `AUTO_DEPLOY=false` in the `production` environment (§2.2).
5. Add `promote-to-prod.yml` — spec'd in §5 so it is not designed under pressure.
6. Add `pr-source-check.yml` enforcing `develop → main`.
7. Document that `feature → develop` **squash**-merges and `develop → main` uses a
   **merge commit**. Squashing there creates ghost commits on develop whose content
   is on main under different SHAs; git reads them as add/add conflicts and forces
   manual resolution on every subsequent release PR.

Nothing in phase 1 is undone. Steps 1–4 and 6 are a single afternoon.

### 2.4 Build args vs. runtime env — the contract

Written down now, before M3 (R2), M6 (FedEx) and M7 (Stripe) introduce real secrets:

- **Build arg** — `NEXT_PUBLIC_*` only, plus `SENTRY_ORG`, `SENTRY_PROJECT` and
  `GIT_SHA`. Baked into the image and, by definition, public.
- **BuildKit secret mount** — `SENTRY_AUTH_TOKEN`. An earlier draft of this spec
  listed it as a build arg; that was wrong. It is a credential, and CI uses
  `cache-to: type=gha,mode=max`, which exports intermediate builder layers and
  their ENV metadata to the Actions cache. Pass it via `secrets:` in
  `docker/build-push-action` with `RUN --mount=type=secret`, never `ARG`.
- **Runtime env, set in Coolify** — `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `MEILISEARCH_MASTER_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, FedEx credentials.
  **Never** a build arg — a build arg lands in the image layers and in GHCR.

A secret that appears as an `ARG` is a leaked secret, regardless of how the
container is later run.

---

## 3. Deliverables

### A. Docker

#### A1 — `Dockerfile`

Three stages, ported from cardstrade with the arg list adjusted to this stack.

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG GIT_SHA

# SENTRY_AUTH_TOKEN is deliberately NOT an ARG — see §2.4. It is a credential,
# and `cache-to: type=gha,mode=max` exports builder layers and their ENV
# metadata to the Actions cache. Pass it as a BuildKit secret mount instead:
#   RUN --mount=type=secret,id=sentry_auth_token \
#       SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) npm run build

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

# ---- runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Notes:
- `NODE_OPTIONS=--max-old-space-size=6144` applies to the **builder stage on the
  runner box**, not to netcup. The runtime stage sets no heap flag; a Next.js
  standalone server idles at roughly 150–300 MB, comfortable on 8 GB. See §8 for
  what else wants that RAM.
- Args for services not yet built (Stripe, Supabase) are declared now. An unset
  `ARG` is an empty string and harmless; adding it later means editing the
  Dockerfile *and* the workflow at the moment you can least afford noise.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the name to revisit in M0 — recent Supabase
  projects issue a *publishable key* (`sb_publishable_…`) instead of an anon JWT.
  Settle it when the project is created; it is a rename in two files.
- No `HEALTHCHECK` instruction: Coolify polls `/api/health` (C1) over HTTP, a
  stronger signal than anything the container can assert about itself.

#### A2 — `output: 'standalone'` in `next.config.ts`

```ts
const nextConfig: NextConfig = {
  output: 'standalone',
};
```

Required by stage 3 of A1 — without it there is no `.next/standalone` to copy.
Verified as current API in Next 16
(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`).

**Hard dependency of A1.** A1 without A2 fails at the `COPY` step.

#### A3 — `.dockerignore`

cardstrade's file, minus the `supabase/.temp` entries (no `supabase/` yet — add
them with D2), plus this repo's agent/scratch dirs:

```
node_modules
.next
.turbo
out

.git
.gitignore
.gitattributes

Dockerfile
.dockerignore

.env
.env.*
!.env.example

README.md
docs
*.md

.vscode
.idea
.DS_Store
Thumbs.db

.eslintcache
coverage
playwright-report
test-results

.claude
.superpowers
skills-lock.json
```

Excluding `docs/` matters more than it looks: `docs/01-project-estimation.md` is a
client-facing commercial document with hour budgets and pricing. It has no business
inside a shipped image.

### B. CI

#### B1 — `.github/workflows/ci.yml`

- Triggers: `pull_request` and `push` on `main`.
- `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true`.
- `runs-on: [self-hosted, linux, x64]`, `timeout-minutes: 20`.
- `env: FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`.
- Steps: `checkout` → `setup-node@v4` (node 24, **no** `cache: npm`) → `npm ci`
  → `npm run lint` → `npx tsc --noEmit` → `npm run build`.
- `NODE_OPTIONS: --max-old-space-size=6144` on typecheck and build.
- Build gets placeholder `NEXT_PUBLIC_*` values (`https://placeholder.supabase.co`,
  `http://localhost:3000`, …) so CI never needs real credentials and a hostile PR
  has nothing to exfiltrate.

`cache: npm` is deliberately omitted: `~/.npm` persists on the self-hosted box
between runs (the runner wipes only `_work`), so `npm ci` already hits a warm local
cache. The remote GHA cache would re-upload the tree every run.

#### B2 — Node 24 standardization

- `package.json`: `"engines": { "node": ">=24.0.0", "npm": ">=10.0.0" }`
- `devDependencies`: `@types/node` `^20` → `^24`
- `node-version: 24` in every `setup-node`
- `node:24-alpine` in A1

Run `npx tsc --noEmit` after the types bump — a major `@types/node` bump
occasionally surfaces new strict-mode errors. Fixing them is part of this work.

### C. Build, push, deploy

#### C1 — `app/api/health/route.ts`

```ts
import { NextResponse } from 'next/server';
import packageJson from '@/package.json';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sha: process.env.NEXT_PUBLIC_GIT_SHA ?? 'unknown',
    version: packageJson.version,
  });
}
```

- Lives **outside** `app/[locale]/`. `proxy.ts` already excludes `/api` from locale
  negotiation (`matcher: "/((?!api|_next|_vercel|.*\\..*).*)"`), so it is reachable
  at `/api/health` with no i18n changes.
- `resolveJsonModule` is already `true` in `tsconfig.json`, so the `package.json`
  import type-checks as-is.
- Echoing the baked `NEXT_PUBLIC_GIT_SHA` is what makes deploy verification
  possible: `curl https://…/api/health | jq .sha` proves new bytes are live.

**Take with C2.** Coolify's zero-downtime deploy and every rollback procedure in
E2 depend on this endpoint.

#### C2 — `.github/workflows/build-and-push.yml`

- Trigger: `push` on `main`.
- `permissions: contents: read, packages: write, actions: read`.
- `concurrency: build-${{ github.sha }}`, **`cancel-in-progress: false`** — every
  commit deserves its own image. Keyed by **SHA, not ref**: a ref-keyed group
  holds one running plus one pending run and drops the older pending one, so
  rapid pushes would silently skip `prod-<sha>` images and break the retag
  rollback in §4.
- **Two jobs, because a per-SHA group means concurrent builds and therefore
  completion order ≠ commit order.** The immutable per-commit tag is safe to
  write from any order; the mutable `prod-latest` tag and the deploy are not.
- `environment: production`, self-hosted.

**Job `build`** (`timeout-minutes: 40`) — writes only `prod-<sha>`:
  1. `checkout`
  2. `docker/setup-buildx-action@v3`
  3. `docker/login-action@v3` → `ghcr.io`, `${{ secrets.GITHUB_TOKEN }}`
  4. `docker/metadata-action@v5` → `ghcr.io/${{ github.repository_owner }}/artgradings-frontend`,
     tag `prod-${{ github.sha }}` **only**
  5. `docker/build-push-action@v5` → `cache-from/to: type=gha,mode=max`, build args
     from `vars.*` (public); `SENTRY_AUTH_TOKEN` via `secrets:` secret mount (§2.4)
  6. Sentry release + deploy marking (D1)

**Job `promote`** (`needs: build`, `timeout-minutes: 10`) — everything mutable:
  1. **Tip guard** — `gh api .../git/ref/heads/<branch>`; promote only if the tip
     still equals `github.sha`. This is the load-bearing control.
  2. `prod-<sha>` → `prod-latest` via `docker buildx imagetools create` (a
     registry-side manifest copy — no pull, no rebuild, so what ships is
     bit-for-bit what CI built)
  3. Coolify deploy, **conditional on `vars.AUTO_DEPLOY == 'true'`** (§2.2)

  Job-level `concurrency: promote-${{ github.ref }}`, `cancel-in-progress: true`
  drops a superseded promotion that has not started. It is **not sufficient on
  its own**: if the newer build finishes first and promotes, the older promotion
  finds nothing to cancel and would overwrite `prod-latest` with stale code and
  redeploy it. The tip guard is what catches that case.

Phase 2 adds `test-*` tags gated on `develop` to `build` step 4 and flips the
variable in `promote` step 3. Everything else is untouched.

### D. Selected extras

#### D1 — Sentry

- `npm i @sentry/nextjs`
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Wrap the config:
  `export default withSentryConfig(withNextIntl(nextConfig), { org, project, silent: !process.env.CI, widenClientFileUpload: true })`
- Build args already declared in A1
- Release marking in C2: `releases new` → `set-commits --auto --ignore-missing` →
  `finalize` → `deploys new -e production`. `--ignore-missing` is required because
  `actions/checkout` shallow-clones and the previous release's commit is unreachable.

**Caveat — this is a scope addition.** `CLAUDE.md`'s target stack does not list
Sentry. It adds a dependency, a vendor account, and a paid tier once volume grows.
Cheap now, awkward to retrofit after M8's error-handling work. Flag it to the client
if error-monitoring tooling is a billable line item.

#### D2 — `db-migrate-dev.yml` / `db-migrate-prod.yml`

Ported from cardstrade, remapped for phase 1's single branch. **Phase 1 has one
Supabase project**, so only the prod workflow is live; the dev one lands in phase 2
alongside `develop`.

| | Phase 1 | Phase 2 |
|---|---|---|
| Dry-run + PR comment | `pull_request` → `main`, paths `supabase/**` | dev on `develop`, prod on `main` |
| Apply | `push` → `main` | dev on `develop` push; prod on `main` push |

Both use `supabase/setup-cli@v1` → `supabase link` → `supabase db push`, then deploy
every `supabase/functions/*/` skipping `_`-prefixed shared libs. The prod flavour adds
the review checklist to the PR comment (backwards-compatibility, RLS, indexes) and the
type-drift check against **`lib/supabase/database.types.ts`** — note the path, this
repo has no `src/`.

These files are **inert until M0 creates `supabase/`**. That is fine; landing them now
means the first migration is already governed.

When this lands, add `supabase/.temp` and `supabase/.branches` to A3.

#### D3 — `wait-for-migrations` gate

A job in C2 polling `gh api …/workflows/<wf>.yml/runs?head_sha=$SHA` every 30s for up
to 30 minutes. No run for the SHA → proceed. Succeeded → proceed. Failed → abort the
build.

Prevents deploying an image whose code expects a schema that has not landed. In phase 1
this matters *more* than it does for cardstrade, because `main` deploys straight to
production. Requires `gh` and `jq` on the runner. **Only meaningful with D2.**

#### D4 — `ai-review.yml`

3-leg OpenCode matrix (`fail-fast: false`), self-hosted, `timeout-minutes: 30`,
`concurrency` keyed on the PR number, on `pull_request` to `main`.

Two hardening steps from cardstrade are **not optional** — port them verbatim:

1. **Pin reviewer config to the base ref.** Overwrite `.opencode/agents/reviewer.md`
   and `opencode.json` from the PR's *base* branch before running. Without this, a PR
   can edit the reviewer's own config to remove `edit: deny` and widen bash permissions
   — arbitrary code execution on your runner.
2. **Isolate `XDG_DATA_HOME` per leg.** All legs run as the same user against one ~1 GB
   WAL-mode SQLite file; concurrent starts make losers die instantly with "database is
   locked". Give each leg a private data dir under `$RUNNER_TEMP` and **symlink** (not
   copy) `auth.json` so refreshed tokens are written back.

Also requires `opencode.json`, `.opencode/agents/reviewer.md`, and the runner user
logged into OpenCode (`~/.local/share/opencode/auth.json`).

### E. Repo hygiene

#### E1 — `.env.example` + `.gitignore` fix

`.gitignore` currently ignores all `.env*`, which would swallow `.env.example`. Add
`!.env.example` and commit an example listing every variable in §2.4, split into
"baked at build" and "runtime only" sections with values redacted.

#### E2 — Documentation

- `docs/deployment/CICD_PIPELINE.md` — the pipeline as built, including §2.1's
  reasoning and the §2.3 migration table.
- `docs/deployment/ROLLBACK.md` — two levers, in order of preference:
  1. **Retag** a known-good `prod-<sha>` as `prod-latest` and redeploy; verify via
     `/api/health`. Fast, surgical, no data implications.
  2. **netcup Copy-On-Write snapshot** restore — whole-box, and it rolls back
     *everything on the box*. Last resort.
  Include the "what if the rollback needs a schema rollback" case explicitly, even if
  the answer is "call the developer" — Supabase is not covered by either lever above.
- `CLAUDE.md`: append a **Git Workflow & CI/CD** section, and **fix the stack table**,
  which still says `Hetzner (prod), Contabo (staging)`.

---

## 4. Not included in phase 1

| Item | Why |
|---|---|
| `promote-to-prod.yml` | Its job is retagging test → prod. Meaningless with one environment. Spec'd in §5, added in phase 2. |
| `pr-source-check.yml` | Enforces "PRs to main come from develop". Meaningless with one branch. Phase 2. |
| `docker-compose.meilisearch.yml` | Declined. Revisit at M4 if local search work becomes painful. |
| E2E / Playwright in CI | M8 scope. B1 is structured so a `test` step slots in without restructuring. |
| Coolify application setup | Infrastructure, not repo content. Prerequisite — see §6. |

---

## 5. Phase 2: `promote-to-prod.yml` (spec'd now, built later)

Recorded here so the release gate is designed calmly rather than the week of launch.

`workflow_dispatch` with inputs `sha` (required, 40-char) and `version` (optional,
defaults to `package.json` version).

1. `checkout` with `fetch-depth: 0`, `ref: main`.
2. **Validate the SHA** — strip whitespace (the GitHub UI injects it on paste), assert
   `^[0-9a-f]{40}$`, assert `git cat-file -e` finds the object, then assert
   `git merge-base --is-ancestor "$SHA" HEAD` unless it equals HEAD. A SHA that never
   passed CI on `main` must not be promotable.
3. Resolve the version tag.
4. `docker pull` `prod-<sha>`, retag `prod-latest` and `v<version>`, push. **A pure
   retag** — the bytes were built from `main` with production build args (§2.1), so no
   rebuild is needed and the artifact stays immutable.
5. Mark a Sentry production deploy.
6. Write a `$GITHUB_STEP_SUMMARY`: the image is in GHCR, deployment is a manual
   **Deploy** click in Coolify, then `curl https://<domain>/api/health | jq .sha`.

`environment: production` gates the job on a required reviewer. With `AUTO_DEPLOY=false`
and the Coolify API token revoked, that click is the last human gate before customer
traffic.

---

## 6. Prerequisites (outside this repo)

1. Self-hosted runner registered to this repo or its org with labels
   `self-hosted, linux, x64`, Docker + buildx, `gh`, `jq`, and the runner user in the
   `docker` group.
2. GHCR package `artgradings-frontend` created, with the repo granted write access.
3. Coolify installed on the netcup box, with an application pulling `:prod-latest`,
   health check `/api/health`, plus its incoming webhook URL and API token.
4. GitHub environment `production` (add `test` in phase 2). Add a required reviewer at
   M8, not before — it would only slow the pre-launch loop.
5. Repo variable `AUTO_DEPLOY=true`.
6. Sentry project + auth token (D1 only).
7. Supabase project + access token (D2 only).
8. OpenCode auth on the runner user (D4 only).

### GitHub configuration

**Variables** (`vars`, on the `production` environment): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`,
`SENTRY_ORG`, `SENTRY_PROJECT`, `AUTO_DEPLOY`

**Secrets:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SENTRY_AUTH_TOKEN`,
`COOLIFY_WEBHOOK_URL`, `COOLIFY_TOKEN`, `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF`

Phase 2 adds the same set scoped to a `test` environment, and splits
`SUPABASE_PROJECT_REF` into `_DEV_` and `_PROD_`.

---

## 7. Suggested order

1. A2 + A1 + A3 — verify locally:
   `docker build -t ag:local . && docker run -p 3000:3000 ag:local`
2. B2 — Node 24, then confirm `npm run build` and `npx tsc --noEmit` still pass
3. B1 — CI green on a throwaway PR
4. C1 — health route
5. C2 — first image in GHCR, first deploy to netcup
6. E1 + E2
7. D1 → D2 → D3 → D4 as each dependency becomes real

Steps 1–6 are independent of every module M1–M8 and can land immediately. D2 and D3 are
gated on M0's Supabase project existing.

---

## 8. Verification

Each deliverable is done when:

- **A1/A2/A3** — `docker build` succeeds; `docker run -p 3000:3000` serves the landing
  page; `docker image inspect` shows the runner stage running as uid 1001;
  `docker history` shows no secret values.
- **B1** — a PR shows a green CI check; an intentional lint error turns it red.
- **B2** — `npm run build` and `npx tsc --noEmit` pass on Node 24.
- **C1** — `curl localhost:3000/api/health` returns 200 with a `sha` field, and the path
  is not locale-redirected.
- **C2** — the tag appears in GHCR and netcup serves the new SHA at `/api/health`.
- **§2.2 switch** — set `AUTO_DEPLOY=false`, push, confirm the image builds and the
  deploy step is skipped. Test this *once, deliberately*, before it matters at launch.
- **D2** — a PR touching `supabase/migrations/**` gets a dry-run comment; merging applies it.
- **D3** — a deliberately failing migration blocks the build.
- **D4** — a PR receives one comment per model leg, all three surviving.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A secret is added as a build arg and leaks into a public GHCR layer | §2.4 contract, documented in `CLAUDE.md`; `docker history` check in §8 |
| `main` deploys straight to production with no gate | Accepted pre-launch (no users). §2.2 makes closing the gate a one-variable change; §8 requires testing that switch before launch, not during it |
| Test env is added later by pointing a second host at `main` | This is the broken configuration in §2.1. Phase 2 adds a **branch and** a host. Called out in `CICD_PIPELINE.md`. |
| 8 GB / 4 cores on netcup runs out | The Next.js container is 150–300 MB, but Coolify (~1 GB) and a self-hosted Meilisearch (RAM-resident index, grows with the Pop Report corpus) share the box. **Size Meilisearch against this box at M4, before indexing the full corpus.** Builds never run here (DEC-3). |
| Only one host exists, so a test env competes for the same RAM | Phase 2 decision: second netcup box, or a second Coolify app here. Defer, but do not assume it is free. |
| A PR rewrites the AI reviewer's permissions and runs code on the runner | D4 hardening step 1 — pin config to base ref |
| Self-hosted runner is a single point of failure | Accepted. Workflows are plain enough to fall back to `ubuntu-latest` by editing `runs-on`. |
| Sentry is scope creep against the estimate | Flagged in D1; client decision |
