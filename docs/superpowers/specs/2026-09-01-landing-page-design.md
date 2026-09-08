# Landing page, How it works, FAQ

**Date:** 2026-09-01
**Status:** Implemented on `feat/landing-page`
**Module:** M1 — Design system & public pages

## Goal

Build the three public content pages M1 still owes: the landing page, How it
works, and FAQ. The source of truth is `Art Grading.dc.html` in the Claude
Design project *Card grading webapplication design*
(`5c1c1d85-6355-4e6a-943d-bfa4a59f9236`) — the light variant the customer
approved.

The design system foundation
(`docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`) already
ported every primitive these pages need. This spec is about composition: turning
those primitives into page-level sections, and deciding what the design file's
content means when it reaches a public URL.

## Source analysis

`Art Grading.dc.html` is a **single-page site**, not a landing page. It renders
nine bands:

| Band | Disposition here |
|---|---|
| Nav | Already built — `components/layout/site-header.tsx` |
| Hero (A/B toggle) | **Variant A**, this spec |
| How it works — 4 steps | This spec, on two routes |
| Showcase — filterable slab grid | This spec |
| Pricing — 4 tiers | **Deferred**, see Non-goals |
| Submit form + order summary | **M3** |
| FAQ accordion | This spec, on two routes |
| Closing CTA band | This spec |
| Footer | Already built — `components/layout/site-footer.tsx` |

The file's `support.js` is the generated Design Canvas runtime — it compiles
`<x-dc>`, `<sc-if>`, `<sc-for>` and `DCLogic` to React in the browser. It is a
renderer, carries no design intent, and nothing in it is ported.

The `hero` prop is an unresolved A/B toggle in the source. Variant A is the
design's own default and shows three slabs rather than one, which is what the
estimate's "Trending Cards" line asks for near the top of the page. **A is
chosen.** Variant B is not built; re-opening that decision is a new task.

## Non-goals

- **The pricing page and the pricing band.** `docs/01-project-estimation.md`
  never scopes a pricing page, §337 puts pricing and turnaround times in the
  client-supplied column, and line 349 names imprecise business-rule definition
  as a top project risk. The design's `$19 / $39 / $99 / $299` tiers, its
  `45 / 20 / 5 business day` turnarounds and its `$499 / $2,500 / $10,000` value
  caps are invented. `/pricing` stays a 404 until the client supplies real
  numbers.
- **The submission form.** M3, 88 hours, multi-card with R2 uploads. The design's
  single-card form is a teaser for a flow that does not exist yet.
- **The Pop Report.** M4. The showcase reads fixtures; see *Data*.
- **The mobile nav drawer.** Still four links and nothing to hide behind a
  hamburger. Unchanged from the foundation spec.
- **A second locale.** `en` only, as today.

## Approach

### Route structure

The design is one page with anchor links (`#how`, `#showcase`, `#pricing`,
`#faq`). We build **separate routes** instead:

```
app/[locale]/page.tsx               landing
app/[locale]/how-it-works/page.tsx  full process
app/[locale]/faq/page.tsx           full accordion
```

Three reasons. The estimate scopes How it works and FAQ as standalone static
pages (§43, §72–73). `components/layout/site-header.tsx` already links to
`/how-it-works` and `/faq` as routes, and today both 404. And each page gets its
own canonical URL, `<title>` and description, which one-page anchors cannot
give — the client will want to link a customer straight to the FAQ.

The cost is that the steps grid and the FAQ list each render on two routes. That
is why they take their content as props rather than reading messages directly at
the leaf.

`/pricing` and `/pop-report` remain dead links in the header after this work.
That is deliberate and must be stated at handover rather than papered over with
stub pages nobody scoped.

### Component placement

Reusable page bands go in a new `components/sections/`, mirroring the existing
`components/ui/` and `components/layout/` split. Route-local `_sections/`
directories stay reserved for one-offs, as `/design` uses them.

```
components/sections/hero.tsx           server
components/sections/steps.tsx          server
components/sections/showcase.tsx       "use client"
components/sections/faq-section.tsx    server
components/sections/cta-band.tsx       server
```

`showcase.tsx` is the only client component: its All / Sports / TCG filter is
local state over an array that is already loaded. `NextIntlClientProvider` wraps
the whole tree in `app/[locale]/layout.tsx`, so `useTranslations` works there
unchanged.

## Components

### Reused unchanged

`Slab`, `GradeBadge`, `Stat`, `StatStrip`, `Section`, `Container`,
`buttonVariants`, `Eyebrow`, `Kicker`, `SegmentedControl`, `Accordion`. No
primitive is modified by this work.

Two of them carry most of the weight:

- **`Section invert`** produces the dark showcase and CTA bands. It applies
  `surface-invert`, which redefines the role tokens locally — including
  `--gold-ink`, whose contrast relationship flips on ink. Nested components
  follow automatically. **No `dark:` class is written anywhere in this work.**
- **`Accordion`** already takes `items: AccordionItem[]`. The FAQ is close to
  free.

### `Hero` — new

Variant A, centered. `Eyebrow` → `h1.text-display` at `max-w-[880px]` → lead at
`max-w-[600px]` → CTA pair → `StatStrip` → a row of three `Slab`s.

The secondary CTA in the design points at `#pricing`. Since `/pricing` is
deferred, **it points at `/how-it-works`** and uses the existing
`home.ctaSecondary` message ("See how it works"). This is recorded in
`docs/content-requests.md` as a swap to revisit when pricing lands.

The primary CTA keeps `/submit`, which 404s until M3 — the same status the
header's Submit button already has.

### `Steps` — new

`{ items }` → a 4-column grid. The design draws internal hairlines as
`background: var(--line)` behind a `gap: 1px`; ported as `bg-hairline gap-px`
with `bg-surface` children inside a `rounded-panel overflow-hidden` wrapper,
which themes itself because `--ag-hairline` is redeclared in the dark block.

Each cell: mono step number in `text-gold-ink`, `h3`, description. `min-height`
matches the design's 230px so a short description does not collapse its cell.

### `Showcase` — new, client

`{ cards }` → `Section invert` containing `Eyebrow`, an `h2`, a
`SegmentedControl` and a grid of `Slab`.

Filtering is `useState` over the `cards` prop, matched on `SlabData.category`.
The `All` option is synthesised in the component, not stored in the data. Base
UI's `ToggleGroup` models value as an array even when single-select and can hand
back an empty one — `SegmentedControl` already normalises both, so the caller
sees a plain string.

### `FaqSection` — new

`{ items, heading, footerLink? }` → `Eyebrow`, heading, `Accordion`, optional
trailing link. Thin, but it owns the band padding and the `max-w-[760px]`
measure so neither route repeats them.

`heading` is passed as a resolved string and always renders as an `h2`: on both
routes the page supplies its own `h1`, so the section never competes for the
document's single top-level heading.

### `CtaBand` — new

`Section invert`, centered, `padding-block` 110px. Its `h2` is 52px in the
design against the `text-h2` token's 42px, so it takes an explicit class rather
than a new token — one instance does not earn a scale entry.

## Data

The showcase reads `SAMPLE_SLABS` from `components/slab/fixtures.ts`, extended
from 4 cards to the design's 8.

**This supersedes a rule in the foundation spec.** That spec said fixtures
"never rendered on a public page". They now are. The reasoning has changed
rather than been forgotten: the Pop Report and its schema are M4, M0 shipped
only the auth foundation (`profiles`, `roles`, `permissions`, `user_roles`,
`role_permissions` — no cards table of any kind), and designing a `graded_cards`
table from a landing page's needs would mean designing it twice, since M4's
version must also serve population counts, Meilisearch sync and a detail page.

The fixture header comment must be rewritten to say what is now true: this is
placeholder data rendered publicly, pending M4, and it is not a real record of
any card, grade, or certificate.

The swap point is one prop:

```tsx
<Showcase cards={SAMPLE_SLABS} />      // M1
<Showcase cards={await getTrending()} />  // M4 — same SlabData[]
```

## Content & i18n

Every string goes to `messages/en.json`. New namespaces `howItWorks` and `faq`;
`home` is extended with hero, showcase and CTA keys. `global.d.ts` types keys off
that file, so a missing key is a build error.

The steps array and the FAQ array are read from messages via `t.raw()` and passed
down as props, so the same component serves the condensed and full renderings.

### Placeholder content, and how it is tracked

The design's copy contains quantified and contractual claims we cannot verify:
`1.2M+ cards certified`, `48hr`, `100% authentication guarantee`, `4-point
sub-grade report`, and an FAQ answer promising to "refund the grading fee and
the card's declared value".

**Decision: these ship as placeholders and are swapped before launch.** They
render exactly as the customer approved the design. This was an explicit call
made with the risk stated.

The safeguard is `docs/content-requests.md`, created by this work, listing every
placeholder string with its message key and what is needed from the client. The
refund-guarantee FAQ answer and the `1.2M+` figure are called out at the top as
the two that carry contractual and advertising weight. Nothing about launch may
depend on remembering this conversation.

### The duplication gap

The design wrote only 4 steps and 6 FAQ answers. If the landing page shows all
of them, `/how-it-works` and `/faq` are duplicates with a different `<h1>`.

Accepted for now, handled as: the landing shows all 4 steps plus a "Read the
full process →" link, and the first 4 FAQ items plus "See all questions →".
`/how-it-works` and `/faq` render the full sets.

The slice lives in `app/[locale]/page.tsx` (`items.slice(0, 4)`), not inside
`FaqSection` — the section renders what it is given, so the two routes differ in
their data rather than in a flag. The two links need new message keys,
`home.stepsLink` and `home.faqLink`, and both are ordinary translatable copy
rather than placeholders. Both pages stay thin until the
client supplies per-step detail and further FAQ entries, which are the first two
entries in `docs/content-requests.md`.

## Responsive

The design is authored at 1180px only; every breakpoint below that is ours.

| Element | Mobile | Tablet (`md`) | Desktop (`lg`) |
|---|---|---|---|
| Steps grid | 1 col | 2 col | 4 col |
| Showcase grid | 1 col | 2 col | 4 col |
| Hero slab row | 1 | 2 | 3 |
| `StatStrip` | 2×2 | row | row |

The hero slab row caps at 2 on tablet rather than squeezing 3 — at `md` a third
column puts the slab below its legible width. `section-y` already steps 3.5rem →
6.5rem at `md`. `Container` supplies the 1180px measure and the gutter.

## Testing

Colocated `*.test.tsx` beside each section, through `renderWithIntl` from
`@/test/i18n`, asserting against imported `messages/en.json` — never a copy
literal.

- `Steps` renders one cell per message entry.
- `Showcase` filter narrows the grid to the chosen category and `All` restores
  the full set. Driven through `userEvent` from `renderWithIntl`, not
  `fireEvent`.
- `FaqSection` toggles a panel open and closed.
- `Hero` CTAs resolve to `/submit` and `/how-it-works` — asserting the
  `/pricing` swap, so a future edit that reintroduces the dead link fails.

`components/gold-ink.test.ts` and `app/globals.token.test.ts` cover the new
markup automatically; no `text-gold` and no undeclared token may appear.

The three `page.tsx` files are Server Components. Per `CLAUDE.md`, async Server
Components are not unit-testable under Vitest — route-level rendering is E2E's
job in M8. Do not fight Vitest over them.

## Verification

- `npm run lint`, `npm run build`, `npm test` clean.
- All three routes prerender as static HTML (`npm run build` output shows `○`).
- `/how-it-works` and `/faq` resolve from the header nav, which they do not
  today.
- Light and dark both render correctly with no `dark:` class added anywhere.

## Known gaps

- `/pricing` and `/pop-report` remain 404 from the header nav.
- `/submit` remains 404 from two CTAs until M3.
- Showcase cards are fixtures until M4.
- Placeholder marketing copy is live, tracked in `docs/content-requests.md`.
- No mobile nav drawer.
