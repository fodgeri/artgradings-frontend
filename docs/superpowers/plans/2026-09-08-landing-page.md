# Landing page, How it works, FAQ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three public content pages M1 still owes — landing, How it works, FAQ — composing existing primitives into page bands.

**Architecture:** Five reusable bands in a new `components/sections/`, each taking content as props so the same component serves the condensed landing rendering and the full standalone route. Only `Showcase` is a client component (local filter state). Dark bands come from `Section invert`, never a `dark:` class.

**Tech Stack:** Next 16.3 App Router, next-intl, Tailwind v4, Base UI, Vitest 4 + RTL.

**Spec:** `docs/superpowers/specs/2026-09-01-landing-page-design.md` — approved 2026-09-01. It carries the per-component detail, the responsive table and the content decisions; this plan sequences it and records what the rebrand changed.

## Global Constraints

- **No hardcoded user-facing copy.** Everything to `messages/en.json`; `global.d.ts` types keys off it so a missing key fails the build. Exceptions are `app/global-error.tsx` and `app/[locale]/design/` only.
- **Import `Link` from `@/i18n/navigation`**, never `next/link`. Never hand-build a `/${locale}/...` path.
- **No `dark:` class anywhere in this work.** `Section invert` redefines the role tokens locally.
- **Never write `text-gold`** — `text-gold-ink` is the only gold text. `components/gold-ink.test.ts` enforces it and its allowlist is empty.
- **Never assert copy as a literal in tests.** Import `messages/en.json` and assert against `messages.home.title`.
- Component tests go through `renderWithIntl` from `@/test/i18n`; import `describe`/`test`/`expect` from `vitest` (`globals: false`).
- Async Server Components are not unit-testable under Vitest. The three `page.tsx` files get no unit tests — that is E2E's job in M8. Do not fight Vitest over them.
- **Do not invent business rules.** Pricing, turnaround times, the grading scale and the gas-fill claim are client-supplied. Placeholder copy ships only where the spec already decided it does, and every instance is tracked.

## What the rebrand changed

`feat/brand-identity` merged after this spec was approved. Deltas:

- **`SlabData` gained `number` (required) and `rarity` (optional).** Extending the fixtures from 4 to 8 cards means supplying `number` for all eight; omit `rarity` on some so both branches stay exercised.
- **The gas fill needs a home.** `docs/superpowers/specs/2026-09-08-brand-identity-adoption-design.md` placed it on the landing page and in How it works, with `GasShield` as the icon and the wording client-supplied. It annotates the **existing** seal step rather than adding a fifth — inventing a step the approved design does not have would be scope creep, and inventing the claim's wording is not ours to do.
- Token *names* are unchanged, so every `text-gold-ink`, `--gold-ink` and `SlabData.category` reference in the spec still holds.

---

### Task 1: Content and fixtures

**Files:**
- Modify: `messages/en.json`
- Modify: `components/slab/fixtures.ts`
- Create: `docs/content-requests.md`

**Interfaces:**
- Produces: `home.*` extended; new `howItWorks` and `faq` namespaces, each with a `steps` / `items` array read via `t.raw()`. `SAMPLE_SLABS: SlabData[]` grows 4 → 8.

- [ ] **Step 1: Extend the messages**

Add to `home`: `heroEyebrow`, `heroTitle`, `heroLead`, `stats` (4 × `{value,label}`), `showcaseEyebrow`, `showcaseTitle`, `filterAll`, `stepsLink`, `faqLink`, `ctaTitle`, `ctaLead`, `gasFill`. New `howItWorks` namespace with `title`, `lead`, `steps[]` of `{number,title,body}`. New `faq` namespace with `title`, `lead`, `items[]` of `{id,question,answer}` — 6 entries per the design.

- [ ] **Step 2: Grow the fixtures to eight**

Every card needs `number`; leave `rarity` off two or three so the omitted-line branch renders in the gallery and the showcase. Rewrite the header comment: it currently says fixtures are never rendered on a public page, which this work makes false. Say what is now true — placeholder data rendered publicly pending M4, not a real record of any card, grade or certificate.

- [ ] **Step 3: Create `docs/content-requests.md`**

Every placeholder string, its message key, and what is needed from the client. `faq.items` refund answer and `home.stats` `1.2M+` at the top as the two carrying contractual and advertising weight; the gas-fill wording immediately after.

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build` — the build fails on a message key the types do not know.

```bash
git add messages/en.json components/slab/fixtures.ts docs/content-requests.md
git commit -m "feat: add landing page content and grow the slab fixtures"
```

---

### Task 2: `Steps`

**Files:** Create `components/sections/steps.tsx`, `components/sections/steps.test.tsx`

**Interfaces:**
- Produces: `<Steps items={{number,title,body}[]} />`. Consumed by the landing page and `/how-it-works`.

- [ ] **Step 1: Failing test** — renders one cell per item, and the seal step carries the gas-fill note.
- [ ] **Step 2: Run** — `npx vitest run components/sections/steps.test.tsx`, expect FAIL (module not found).
- [ ] **Step 3: Implement** — 4-column grid, hairline rules as `gap-px` on a `bg-hairline` wrapper with `bg-surface` children inside `rounded-panel overflow-hidden`. Mono number in `text-gold-ink`, `h3`, body. `min-h-[230px]`. 1 / 2 / 4 columns.
- [ ] **Step 4: Run** — expect PASS. **Step 5: Commit.**

---

### Task 3: `Showcase`

**Files:** Create `components/sections/showcase.tsx` (`"use client"`), `components/sections/showcase.test.tsx`

**Interfaces:**
- Consumes: `SAMPLE_SLABS` shape from Task 1. Produces: `<Showcase cards={SlabData[]} />`.

- [ ] **Step 1: Failing test** — filtering to a category narrows the grid; `All` restores it. Drive with `userEvent`, not `fireEvent`.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** — `Section invert` + `Eyebrow` + `h2` + `SegmentedControl` + 1/2/4 grid of `Slab`. `useState` over `cards`, matched on `SlabData.category`; synthesise the `All` option in the component. Carries the gas-fill line with `GasShield`.
- [ ] **Step 4: Run**, expect PASS. **Step 5: Commit.**

---

### Task 4: `FaqSection` and `CtaBand`

**Files:** Create `components/sections/faq-section.tsx`, `components/sections/faq-section.test.tsx`, `components/sections/cta-band.tsx`

**Interfaces:**
- Produces: `<FaqSection items={AccordionItem[]} heading={string} footerLink?={{href,label}} />`, `<CtaBand />`.

- [ ] **Step 1: Failing test** — a panel toggles open and closed via `userEvent`.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** — `FaqSection` owns the band padding and `max-w-[760px]`; `heading` always renders as `h2` because both routes supply their own `h1`. `CtaBand` is `Section invert`, centred, `py-[110px]`, with an explicit heading size rather than a new token.
- [ ] **Step 4: Run**, expect PASS. **Step 5: Commit.**

---

### Task 5: `Hero`

**Files:** Create `components/sections/hero.tsx`, `components/sections/hero.test.tsx`

- [ ] **Step 1: Failing test** — the two CTAs resolve to `/submit` and `/how-it-works`. The second is the recorded `/pricing` swap, so a future edit reintroducing the dead link fails.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** — centred: `Eyebrow` → `h1.text-display` at `max-w-[880px]` → lead at `max-w-[600px]` → CTA pair → `StatStrip` → three `Slab`s at 1 / 2 / 3.
- [ ] **Step 4: Run**, expect PASS. **Step 5: Commit.**

---

### Task 6: The three routes

**Files:** Rewrite `app/[locale]/page.tsx`; create `app/[locale]/how-it-works/page.tsx`, `app/[locale]/faq/page.tsx`

- [ ] **Step 1: Landing** — `Hero`, `Steps` (all 4) + "Read the full process →", `Showcase`, `FaqSection` with `items.slice(0, 4)` + "See all questions →", `CtaBand`. The slice lives here, not in the section: the routes differ in their data, not in a flag.
- [ ] **Step 2: `/how-it-works` and `/faq`** — own `h1`, own `generateMetadata` via `getTranslations({locale})`, full sets.
- [ ] **Step 3: Verify** — `npm run build` shows all three prerendering static (`○`/`●`); `/how-it-works` and `/faq` resolve from the header nav, which they do not today.
- [ ] **Step 4: Commit.**

---

### Task 7: Verification and handover

- [ ] **Step 1:** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.
- [ ] **Step 2:** Check both themes render with no `dark:` class added — `grep -rn "dark:" components/sections/ app/\[locale\]` returns nothing.
- [ ] **Step 3:** Update `CLAUDE.md` repo state — the placeholder landing page is gone; three public pages exist; `/pricing`, `/pop-report` and `/submit` remain 404 from the nav, deliberately.
- [ ] **Step 4: Commit.**

## Self-review

**Spec coverage.** Route structure → Task 6. Component placement → Tasks 2–5. Data → Task 1. Content & i18n, placeholder tracking, the duplication gap → Tasks 1 and 6. Responsive → built into each component task. Testing → one test file per section, per the spec's four named cases. Known gaps → Task 7's handover note.

**Type consistency.** `Steps` takes `items` in both Task 2 and Task 6. `FaqSection` takes `items`/`heading`/`footerLink` in Tasks 4 and 6. `Showcase` takes `cards` in Tasks 3 and 6, matching the spec's M4 swap point.

**Deviation.** The gas fill annotates the existing seal step rather than becoming a fifth. Adding a step the approved design does not have is scope creep, and the claim's wording is the client's — this places it and tracks it.
