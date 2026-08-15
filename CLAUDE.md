@AGENTS.md

# ArtsGrading — Card Grading & Authentication Platform

A PSA / Beckett-style online **grading and authentication platform** for collectible cards (TCG — Pokémon, Magic: The Gathering — and sports cards). Users submit cards for authentication and condition grading, track progress, pay online, and browse statistics of already-graded cards.

Two core services:
- **Grading** — expert scoring of a card's physical condition (scaled grade).
- **Authentication** — confirming a card is genuine.

Everything the experts grade and/or authenticate enters the **public database** (Pop Report).

The authoritative scope/estimate document is `docs/01-project-estimation.md` (Hungarian). Read it before planning work on a module — it defines requirements, hour budgets, and milestones. Do not silently expand scope beyond it; scope creep is called out there as the top project risk.

## Repo state

Next.js 16.3, React 19.2, TypeScript (strict), Tailwind CSS v4 (PostCSS plugin, no `tailwind.config`), ESLint 9 flat config. Beyond the i18n setup below, nothing from the spec is implemented yet — `app/[locale]/` holds a placeholder landing page.

Commands:
```bash
npm run dev      # next dev
npm run build    # next build
npm run lint     # eslint
```

Path alias: `@/*` → repo root.

## Target stack

| Concern | Choice |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind |
| Backend / DB / Auth | Supabase (managed Postgres + Auth + Storage, RLS) |
| Object storage | Cloudflare R2 (card images) |
| Search | Meilisearch (self-hosted on the netcup box) |
| Payments | Stripe Checkout + webhooks |
| Shipping | FedEx API (labels, rates, tracking) |
| Transactional email | via Cloudflare |
| Hosting | netcup RS 1000 G12 (Coolify) — production; test env added in phase 2 |
| CI/CD | GitHub Actions on a self-hosted runner → GHCR → Coolify |

Environments will be split **Prod / Test**. Today only production exists (one branch, one host) — see `docs/deployment/CICD_PIPELINE.md` for the phase-2 migration. Never point local or test code at production Supabase/Stripe/FedEx credentials.

## Modules (development phases)

Work is organized into modules M0–M8; they double as milestones MK1–MK7.

- **M0 — Foundation & infra** (56h): project skeleton, CI/CD, Supabase schema + auth + RLS, R2, Meilisearch, prod/test split.
- **M1 — Design system & public pages** (96h): design system, Landing (Trending Cards + intro + CTAs), How it works, FAQ, responsive layout, header/footer/nav.
- **M2 — Accounts & auth** (56h): Supabase Auth (signup / login / password reset), profile & settings, transactional emails, user/admin roles.
- **M3 — Grading submission flow** (88h): dynamic multi-card form ("+" to add a card), per card **name, set, set number, release year** (all required) plus **optional image** uploaded to R2; service selection (grading and/or authentication); price + turnaround estimate; order summary; status tracking in the user account.
- **M4 — Pop Report** (80h): public database of graded cards, Meilisearch search/filter (name, set, year, grade), per-card grade distribution counts, card detail page.
- **M5 — Admin / internal grading workflow** (80h): admin order queue, grading & authentication process (assign grade, update status), automatic Pop Report refresh on finalized grades, internal notes and status log.
- **M6 — FedEx & logistics** (72h): API auth + sandbox, label generation, rate calculation, inbound/outbound tracking, status display, error handling and return flow.
- **M7 — Stripe payments** (50h): server-side Checkout Session (line items, amount, currency, order metadata); webhook endpoint handling `checkout.session.completed`, `payment_intent.succeeded`/`payment_intent.payment_failed` with **signature verification and idempotency**; order state machine update + confirmation email on success, handling of failed/abandoned payments; **full and partial refunds** from admin with refund status tracking; transaction log (invoices/receipts live on Stripe's side).
- **M8 — Testing, polish, launch** (72h): E2E and functional tests, performance and security review, bug fixes, UX polish, production deploy, monitoring, handover docs.

Roughly **710 hours / ~24 weeks**, single senior full-stack developer. Each milestone ends in a demo and client approval gate.

## Design direction

- Premium **black / white / gold** palette reflecting PSA/Beckett prestige.
- Build a real design system (palette, typography, component library) — this is a deliverable, not incidental styling.
- Fully responsive: mobile / tablet / desktop.
- Brand identity and logo design are **out of scope**; work from the color guidance.

## Internationalization

English-only at launch, but every page already runs through **next-intl** so adding a language is config plus a JSON file — no component changes.

| File | Role |
|---|---|
| `i18n/routing.ts` | Locale list and prefix strategy — the only place locales are declared |
| `i18n/request.ts` | Per-request locale + message loading (resolved by convention from `next.config.ts`) |
| `i18n/navigation.ts` | Locale-aware `Link`, `useRouter`, `redirect`, `usePathname` |
| `i18n/messages.d-check.ts` | Compile-time check that each locale file is complete |
| `messages/en.json` | Source of truth for the message shape |
| `global.d.ts` | Types message keys and `Locale` off `messages/en.json` |
| `proxy.ts` | Locale negotiation and redirects (`middleware.ts` was renamed in Next 16) |

Rules:

- **All user-facing copy goes in `messages/*.json`.** No hardcoded strings in components — that's what makes translation a data task later instead of a refactor. The single exception is `app/global-error.tsx`: it renders *instead of* the root layout, so there is no provider, no `locale` param and no messages. It renders Next's built-in error page rather than copy of ours. Don't "fix" it by adding a `useTranslations` call — there is no context for it to read.
- **Import `Link`, `useRouter`, `redirect`, `usePathname` from `@/i18n/navigation`**, never from `next/link` / `next/navigation`. These keep the active locale in the URL; nothing should hand-build a `/${locale}/...` path.
- `useTranslations()` is synchronous and works in Server Components. Use `getTranslations()` only in async contexts (`generateMetadata`, Server Actions, Route Handlers).
- **English is unprefixed** (`/`, `/faq`); other languages are prefixed (`/hu/faq`), and `/en/*` redirects to the unprefixed URL so each page has one canonical URL. Adding a language never changes an English URL.
- Locale resolution order: path prefix → `NEXT_LOCALE` cookie → `Accept-Language` → `en`.
- `i18n/request.ts` reads the locale from `next/root-params`, **not** `requestLocale` — the latter inspects the request and would opt every page out of static prerendering. Server Actions and Route Handlers, where root params are unavailable, must pass a locale explicitly: `getTranslations({locale})`.
- Use ICU syntax for plurals and interpolation (see `home.gradedCount`) rather than concatenating strings — grading counts and prices are pluralized differently per language.
- Format numbers, dates and currency with `useFormatter()`/`getFormatter()`, never hand-formatted.

**To add a language:** add the code to `routing.locales`, add `messages/<code>.json`, and register it in `i18n/messages.d-check.ts` so missing keys fail the build. Routing, `<html lang>`, metadata and every `Link` follow automatically. Verified end-to-end: both locales prerender as static HTML.

## Observability

Sentry (`@sentry/nextjs`), errors + tracing. No Session Replay, no Logs, no
Profiling — those are separate products with separate quota; add one
deliberately, not by reflex.

| File | Runtime |
|---|---|
| `instrumentation.ts` | Registers the server SDKs and exports `onRequestError` — the hook that catches Server Component, Route Handler, Server Action and `proxy.ts` errors |
| `sentry.server.config.ts` | Node |
| `sentry.edge.config.ts` | Edge — this is where `proxy.ts` runs |
| `instrumentation-client.ts` | Browser; also exports `onRouterTransitionStart` |
| `app/global-error.tsx` | Root-layout error boundary |
| `next.config.ts` | `withSentryConfig` wraps `withNextIntl` — source maps, tunnel route |

Rules:

- **All three runtimes need `tracesSampleRate`/`tracesSampler`.** Missing one
  means that runtime silently produces no spans. Editing sampling means editing
  three files.
- **Never pass a `dataCollection` object to `Sentry.init` without reading what
  it does.** Passing it — *even as `{}`* — flips every unset category to its
  permissive default and starts shipping request headers, cookies, query params
  and bodies. Omitting it entirely leaves `sendDefaultPii: false`. For an EU
  platform that will hold names and shipping addresses, the omission is the
  security control.
- **Errors Next.js catches are not captured automatically.** Anything caught
  and not re-thrown — a Server Action returning `{error}` instead of throwing,
  an `error.tsx` boundary — needs an explicit `Sentry.captureException`. This
  matters most for the M3 submission flow and the M7 webhooks.
- **`/api/health` is sampled at 0** in `sentry.server.config.ts`. Coolify polls
  it continuously; without the carve-out it would dominate the trace quota.
- **`tunnelRoute: "/monitoring"`** routes browser events through our own origin
  so ad blockers don't eat them. It is a Next *rewrite*, which runs after
  middleware — so `monitoring` must stay in the `proxy.ts` matcher exclusion or
  locale negotiation redirects it to `/en/monitoring` and every client-side
  report is lost.
- **`release` is `NEXT_PUBLIC_GIT_SHA`** — the same value `/api/health` returns
  as `sha`, so "which release broke" and "which image is live" are one string.
- **`SENTRY_AUTH_TOKEN` is a BuildKit secret, never a build arg.** See the
  Secrets note under Git Workflow & CI/CD; the Dockerfile mounts it for the
  single `npm run build` layer.
- `includeLocalVariables: true` on the server attaches local variable values to
  stack frames. Re-review it at M3/M7, when those frames start holding customer
  data.

## Conventions & constraints

- Orders are driven by an explicit **state machine** — submission, payment, shipping, and grading all mutate order status. Keep transitions in one place; never scatter ad-hoc status writes.
- Webhook handlers (Stripe, FedEx) must be **idempotent** and signature-verified. Assume duplicate and out-of-order deliveries.
- Card images are optional; enforce **size limits and compression** before uploading to R2.
- Supabase **RLS is the security boundary** — a user may only ever see their own orders; Pop Report data is public read.
- Meilisearch is a derived index, not a source of truth. Postgres is authoritative; keep sync explicit and re-buildable.
- Pop Report counts are aggregations over finalized grades only — draft/in-progress grades must never leak into public counts or the public database.
- Never commit API keys (Supabase, Stripe, FedEx, R2, Cloudflare). Use env vars; `.env*` stays gitignored.
- Content (FAQ text, How it works copy, marketing copy), the **grading scale**, pricing rules, and turnaround times are **client-supplied**. Don't invent business rules — flag missing definitions instead.

## Testing

Vitest 4 + React Testing Library, one jsdom environment, config in
`vitest.config.mts`.

```bash
npm test            # single-shot — what CI runs
npm run test:watch  # local loop
npm run test:coverage
```

- **Tests are colocated.** `foo.test.ts` sits beside `foo.ts`. `test/` holds
  shared infrastructure only. Colocating inside `app/` is safe — the App Router
  only treats reserved filenames (`page`, `route`, `layout`, …) as routes.
- **Component tests go through `renderWithIntl` from `@/test/i18n`**, never
  `render` from `@testing-library/react` directly. It supplies
  `NextIntlClientProvider` with the real `messages/en.json`.
- **Never assert user-facing copy as a literal.** Import `messages/en.json` and
  assert against `messages.home.title`. A test that hardcodes copy silently
  stops matching when the message changes.
- **`globals: false`** — import `describe`/`test`/`expect` from `vitest` in
  every file.
- **A test needing Node instead of jsdom** puts `// @vitest-environment node`
  on line 1 (see `messages/messages.test.ts`). When there is enough server code
  to warrant it (M7 webhooks), promote this to `test.projects`.
- **`next-intl` is inlined via `server.deps.inline`, and must stay that way.**
  Its ESM build imports `next/navigation`, and the `next` package ships no
  `exports` map — so native Node ESM resolves that to a literal path and throws
  `ERR_MODULE_NOT_FOUND`. Vite's resolver finds `navigation.js` the way webpack
  and turbopack do. Any future dependency that imports `next/*` internally needs
  the same treatment.
- **Async Server Components cannot be unit-tested** — Vitest does not support
  them, and neither `app/[locale]/layout.tsx` nor multi-step flows nor
  `proxy.ts` locale negotiation are covered here. That is E2E's job in M8.
  Don't lose an afternoon fighting Vitest over `layout.tsx`.
- **Coverage is reported, not gated.** No thresholds until M3/M5 land real
  business logic.

## Git Workflow & CI/CD

**Branches — phase 1: `main` only.** The project is at M0; a second branch with
nothing to integrate is overhead. `develop` arrives in phase 2, together with the
test host (see below).

- Short-lived `feature/*` / `fix/*` branches off `main`, squash-merged back.
- Every push to `main` runs CI (lint → build → typecheck), builds a Docker image,
  and pushes `prod-<sha>` + `prod-latest` to GHCR.
- Deployment to netcup happens automatically **only while `vars.AUTO_DEPLOY` is
  `true`**. At launch it flips to `false` and deploying becomes a manual Coolify
  click. Build and release are separate events either way.

**CI runs build before typecheck.** Next 16 generates `LayoutProps`, `PageProps`
and route types into `.next/types/` during the build, so `tsc --noEmit` on a
clean checkout fails without a prior build. Don't reorder them.

**Secrets — the boundary that matters.** `NEXT_PUBLIC_*` values are inlined into
the client bundle at build time, so they are Docker build args and are public by
definition. Everything else — `SUPABASE_SERVICE_ROLE_KEY`, `R2_*`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `MEILISEARCH_MASTER_KEY`, FedEx
credentials — is **runtime env set in Coolify and must never be a build arg**. A
build arg is baked into the image layers and readable by anyone who can pull it.

An image built with test values *is* a test image and must never be retagged for
production. The corollary: never point a future test environment at `main` — add
a branch and a host together.

### CI/CD reference docs

- `docs/deployment/CICD_PIPELINE.md` — the pipeline as built, the `AUTO_DEPLOY`
  switch, and the phase-2 migration to `develop` + test env
- `docs/deployment/ROLLBACK.md` — retag-and-redeploy, the snapshot last resort,
  and why migrations must be backwards-compatible
- `docs/superpowers/specs/2026-08-07-docker-cicd-design.md` — design rationale

## Explicitly out of scope

Native mobile apps, brand/logo design, marketing & SEO, long-term support (separate agreement), and legal content (ToS, privacy policy — drafted by a lawyer).

Note: the estimate lists i18n as out of scope. The *infrastructure* is in place (above) so translation stays cheap, but **translating the site into further languages is still separately scoped work** — it means writing and maintaining every message file, not flipping a flag.
