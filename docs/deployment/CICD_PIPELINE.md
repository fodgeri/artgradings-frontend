# CI/CD Pipeline

How code gets from a commit to a running container, and what has to change when
the test environment arrives.

Design rationale lives in `docs/superpowers/specs/2026-08-07-docker-cicd-design.md`.
This document is the operational view.

---

## The flow today (phase 1)

```
push to main
    │
    ├─▶ CI (ci.yml)              lint → build → typecheck
    │
    └─▶ Build and Push (build-and-push.yml)
            │
            ├─▶ job: build       docker build → ghcr.io/<owner>/artgradings-frontend
            │                    tag: prod-<sha>  (immutable, one per commit)
            │
            └─▶ job: promote     retag prod-<sha> → prod-latest
                                 only if <sha> is still the tip of main
                    │
                    └─▶ Coolify deploy   only if vars.AUTO_DEPLOY == 'true'
                        (netcup)         → https://<domain>/api/health returns the new sha
```

One branch, one environment. `main` is production.

**Why build and promote are separate jobs.** The concurrency group is keyed by
`github.sha`, so every commit gets its own image and no build can cancel
another's — that is what the rollback runbook depends on. The trade-off is that
rapid pushes build *concurrently*, so completion order is not commit order.
Writing the mutable `prod-latest` tag from the build job would therefore let an
older build that finishes late overwrite a newer one and redeploy stale code.

`promote` guards against that twice: a ref-keyed job concurrency group cancels a
superseded promotion that has not started yet, and — the control that actually
holds — it re-reads main's tip and promotes only if it still equals this run's
SHA. A superseded run still publishes its `prod-<sha>` image; it just does not
touch `prod-latest`.

**Why build runs before typecheck in CI:** Next 16 generates types into
`.next/types/` during the build — `LayoutProps`, `PageProps`, route types. On a
clean checkout there is no `.next/`, so `tsc --noEmit` first fails with
`Cannot find name 'LayoutProps'`. Do not "fix" this by reordering back.

---

## Images are environment-flavored

Next.js inlines every `NEXT_PUBLIC_*` value into the client bundle **at build
time**. `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` therefore live *inside* the image, not just
in the container's environment.

An image built with test values **is a test image**. Retagging it for production
would ship the test Supabase project and test Stripe key to real users, and
nothing would error — the app would quietly talk to the wrong backend.

### The one configuration to never build

**A test environment fed from `main`.** That is one branch producing one image
for two environments, and it forces you to either ship the wrong flavor or
rebuild on promote and lose artifact immutability.

Phase 1 avoids it by having one environment. Phase 2 avoids it by having two
branches. When the test environment arrives, **add a branch and a host
together** — never a second host alone.

---

## The AUTO_DEPLOY switch

`vars.AUTO_DEPLOY` (a variable on the `production` GitHub environment) decides
whether a successful build also deploys.

| Value | Behaviour |
|---|---|
| `true` | Every push to `main` builds an image **and** deploys it. Pre-launch default. |
| `false` | Every push builds and pushes an image; deployment is a human clicking **Deploy** in Coolify. |

Build and release are separate events either way — the image is in GHCR
regardless. The switch only controls whether release is automatic.

### Launch checklist (M8)

1. Set `AUTO_DEPLOY=false` on the `production` environment.
2. Revoke the Coolify API token on the netcup host, so nothing can deploy
   programmatically even if the variable is flipped back by accident.
3. Add a required reviewer to the `production` GitHub environment.
4. Confirm: push a trivial commit, watch the image build and the deploy step
   skip, and confirm `/api/health` still reports the old SHA.

Step 4 is not optional. Test the switch while nothing is at stake.

---

## Phase 2: adding the test environment

Triggered by whichever comes first — a test host being provisioned, or launch.
Every step is additive; nothing from phase 1 is undone.

1. Create `develop` off `main`; make it the default branch.
2. Add `develop` to the branch lists in `ci.yml` and any review/migration workflows.
3. `build-and-push.yml`: gate `test-*` tags on `develop` and `prod-*` on `main`.
   The existing tag lines are untouched — they were environment-prefixed from
   day one for exactly this reason.
4. Set `AUTO_DEPLOY=false` on `production`; the test environment gets its own
   `AUTO_DEPLOY=true`.
5. Add `promote-to-prod.yml` (spec §5): validate the SHA is reachable from
   `main`, pull `prod-<sha>`, retag `prod-latest` + `v<version>`, push. A pure
   retag — no rebuild, because `main` already builds prod-flavored images.
6. Add `pr-source-check.yml` enforcing `develop → main`.
7. **Merge strategy:** `feature → develop` squash-merges; `develop → main` uses a
   **merge commit**. Squashing `develop → main` creates ghost commits on develop
   whose content is on main under different SHAs — git reads them as add/add
   conflicts and forces manual resolution on every subsequent release PR.

---

## Where secrets live

| Kind | Where | Why |
|---|---|---|
| `NEXT_PUBLIC_*` | Docker build args, from GitHub environment vars/secrets | Inlined into the client bundle; public by definition |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build args | Identifiers, not credentials |
| `SENTRY_AUTH_TOKEN` | **BuildKit secret mount** | A real credential. Never an `ARG` — CI uses `cache-to: type=gha,mode=max`, which exports intermediate builder layers *and their ENV metadata* to the Actions cache. Pass it via `secrets:` in `docker/build-push-action` and `RUN --mount=type=secret`. |
| Everything else | **Runtime env in Coolify** | A build arg is baked into image layers and readable by anyone who can pull the image |

### Self-hosted runner exposure

This repo is **public** and the runner is persistent, shared with other
projects, and its user is in the `docker` group — root-equivalent on the host.
Both PR-triggered workflows (`ci.yml`, `ai-review.yml`) therefore carry:

```yaml
if: github.event.pull_request.head.repo.full_name == github.repository
```

Fork PRs must never execute on this runner. `npm ci` alone runs lifecycle
scripts from the PR's own `package.json`, so no workflow edit is even needed to
get code execution. If external contributions are wanted later, add a separate
GitHub-hosted job for them rather than relaxing this guard.

Server-side secrets that must **never** be build args: `SUPABASE_SERVICE_ROLE_KEY`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MEILISEARCH_MASTER_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, FedEx credentials.

To audit an image:

```bash
docker history --no-trunc ghcr.io/<owner>/artgradings-frontend:prod-latest \
  | grep -iE 'SERVICE_ROLE|STRIPE_SECRET|R2_SECRET|SENTRY_AUTH_TOKEN=[^ ]'
```

Any match means the credential is compromised: rotate it, then delete the
package version from GHCR.

---

## Host

netcup RS 1000 G12 — AMD EPYC 9645, 4 dedicated cores, 8 GB DDR5 ECC, 256 GB
NVMe, running Coolify.

**Builds never run here.** They run on the self-hosted GitHub runner; netcup only
pulls and runs images. The `NODE_OPTIONS=--max-old-space-size=6144` in the
Dockerfile applies to the builder stage on the runner, not to this box.

Budget the 8 GB deliberately: the Next.js container idles at roughly 150–300 MB,
Coolify itself takes around 1 GB, and a self-hosted Meilisearch holds its index
in RAM and grows with the Pop Report corpus. **Size Meilisearch against this box
at M4, before indexing the full corpus.** A phase-2 test environment is not free
on this RAM either — it is a second box or a deliberate squeeze, not a formality.
