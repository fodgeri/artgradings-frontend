@AGENTS.md

# ArtsGrading — Card Grading & Authentication Platform

A PSA / Beckett-style online **grading and authentication platform** for collectible cards (TCG — Pokémon, Magic: The Gathering — and sports cards). Users submit cards for authentication and condition grading, track progress, pay online, and browse statistics of already-graded cards.

Two core services:
- **Grading** — expert scoring of a card's physical condition (scaled grade).
- **Authentication** — confirming a card is genuine.

Everything the experts grade and/or authenticate enters the **public database** (Pop Report).

The authoritative scope/estimate document is `docs/01-project-estimation.md` (Hungarian). Read it before planning work on a module — it defines requirements, hour budgets, and milestones. Do not silently expand scope beyond it; scope creep is called out there as the top project risk.

## Repo state

This repo is currently a **bare `create-next-app` scaffold** — Next.js 16.3, React 19.2, TypeScript (strict), Tailwind CSS v4 (PostCSS plugin, no `tailwind.config`), ESLint 9 flat config. `app/` holds only `layout.tsx`, `page.tsx`, `globals.css`. Nothing from the spec is implemented yet.

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
| Search | Meilisearch (self-hosted on Hetzner) |
| Payments | Stripe Checkout + webhooks |
| Shipping | FedEx API (labels, rates, tracking) |
| Transactional email | via Cloudflare |
| Hosting | Hetzner (prod: webapp + services VPS), Contabo (staging) |

Environments are split **Prod / Test**. Never point local or test code at production Supabase/Stripe/FedEx credentials.

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

## Conventions & constraints

- Orders are driven by an explicit **state machine** — submission, payment, shipping, and grading all mutate order status. Keep transitions in one place; never scatter ad-hoc status writes.
- Webhook handlers (Stripe, FedEx) must be **idempotent** and signature-verified. Assume duplicate and out-of-order deliveries.
- Card images are optional; enforce **size limits and compression** before uploading to R2.
- Supabase **RLS is the security boundary** — a user may only ever see their own orders; Pop Report data is public read.
- Meilisearch is a derived index, not a source of truth. Postgres is authoritative; keep sync explicit and re-buildable.
- Pop Report counts are aggregations over finalized grades only — draft/in-progress grades must never leak into public counts or the public database.
- Never commit API keys (Supabase, Stripe, FedEx, R2, Cloudflare). Use env vars; `.env*` stays gitignored.
- Content (FAQ text, How it works copy, marketing copy), the **grading scale**, pricing rules, and turnaround times are **client-supplied**. Don't invent business rules — flag missing definitions instead.

## Explicitly out of scope

Native mobile apps, i18n beyond the base language, brand/logo design, marketing & SEO, long-term support (separate agreement), and legal content (ToS, privacy policy — drafted by a lawyer).
