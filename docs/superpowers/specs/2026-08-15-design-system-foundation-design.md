# Design system foundation

**Date:** 2026-08-15
**Status:** Approved, not yet implemented
**Module:** M1 — Design system & public pages

## Goal

Stand up the design token layer, the glass treatment, the component primitives,
and the site shell that every M1–M7 page will be assembled from. The source of
truth is the Claude Design project *Card grading webapplication design*
(`5c1c1d85-6355-4e6a-943d-bfa4a59f9236`), specifically the `Art Grading.dc.html`
(light) and `Art Grading - Liquid Glass.dc.html` (dark) variants.

The deliverable is the foundation plus an internal gallery that proves it, not
any public page.

## Non-goals

- **The public pages themselves.** Landing, How it works, FAQ, and Pricing are
  the rest of M1 and are built *on* this. The submission form is M3. This spec
  stops at the primitives and the shell.
- **Porting the design's content.** Pricing tiers, slab data, FAQ copy, and the
  `1.2M+ / 48hr / 100%` stat strip in the design file are placeholders. Pricing
  rules, turnaround times, and the grading scale are client-supplied per
  `CLAUDE.md`. They appear in this work only as gallery fixtures under
  `components/**/fixtures.ts`, clearly named as such, and are never rendered on
  a public page.
- **Storybook.** A second build and a second dependency tree to maintain against
  an M8 budget. The `/design` route renders the same components through the real
  Next.js pipeline, real fonts, and the real provider — which Storybook would
  have to be configured to imitate.
- **Brand identity and the logo.** Out of scope per the estimate. The wordmark is
  typographic (`Art` in Newsreader + a gold period), which is what the design
  file itself uses.
- **Animation beyond CSS transitions.** No motion library. The design uses only
  `transition: .15s–.24s ease` plus one cubic-bezier on the switch knob.

## Source analysis

The three variants in the design project (`Art Grading`, `Art Grading - Dark
Glass`, `Art Grading - Liquid Glass`) share **identical markup, identical copy,
and identical layout metrics**. The diff between light and Liquid Glass is
confined to the `:root` token block plus a glass treatment on eight surfaces.
That is the precondition that makes a single token contract with two value sets
cheap; it is why this spec picks semantic indirection over `dark:` variants.

`support.js` in the design project is the `<x-dc>` preview runtime — a React
renderer for the `sc-if` / `sc-for` template attributes, generated from
`dc-runtime/src/*.ts`. It is the harness that makes the `.dc.html` files render
standalone. **Nothing in it is ported.**

Three findings from the diff drive decisions below:

1. **Gold is not one colour.** Light uses `#B0883A`, dark uses `#CBA45A`, and the
   bright variants differ too (`#C9A24B` vs `#DDBC7A`). They are tuned for
   contrast on paper vs. on black. Any literal gold hex in a component is a bug.
2. **Radii are theme-dependent.** Glass surfaces use larger radii than their
   paper equivalents — slab `13px → 18px`, tier `14px → 20px`, form card
   `16px → 22px`. Blur reads softer, so the corners grow to match. Radius is
   therefore a themed token, not a constant.
3. **The gold button changes fill type.** Light is flat `--gold`; dark is
   `linear-gradient(180deg, --gold-bright, --gold)`. So the button fill is a
   token holding a `<image>` value, not a `<color>`.
4. **Gold text on paper fails WCAG AA in the light theme.** Measured:
   `#B0883A` on `#FAFAF8` is **3.13:1**, against a 4.5:1 requirement for normal
   text. The light variant uses gold as a text colour in six places — the
   eyebrow (12px), step number (12px), grade label (8px), FAQ sign, FAQ question
   hover, and footer link hover. The dark theme is fine (`#CBA45A` on `#08080B`
   is 8.57:1); this is a light-theme-only defect. Resolved by splitting the
   token — see `--gold-ink` below. This is a deliberate deviation from the
   source design.

The design is authored at a fixed 1180px preview width and has **no responsive
behaviour at all**. Every breakpoint in this spec is new work, not a port.

## Approach

Semantic token indirection. Raw palettes live as plain CSS custom properties in
`:root` and `[data-theme=dark]`; `@theme inline` maps them onto Tailwind's
namespaces so `bg-surface` compiles to `background-color: var(--surface)` and
re-resolves through the cascade when the theme flips.

The consequence, and the reason for the choice: **components need almost no
`dark:` variants.** Theming is a cascade concern, not a variant concern. The two
alternatives considered were literal dual palettes (`bg-paper dark:bg-ink`,
which doubles every class list and drifts the first time someone forgets a
`dark:`) and porting the raw CSS classes into `@layer components` (fastest to
pixel-parity, but inherits a stylesheet instead of producing the component
library the estimate names as the M1 deliverable).

Tokens are named by **role**, never by value. `paper` and `ink` invert between
themes, so those names cannot survive as literals.

Verified against the toolchain actually installed here (Tailwind 4.3.3), not
assumed:

- `@theme inline` + `var()` indirection emits `background-color: var(--surface)`.
- `@utility glass {…}` compiles and composes with variants
  (`dark:glass` → `.dark\:glass:where([data-theme=dark], …)`).
- The multi-rule `@custom-variant dark` form below parses.
- `border-gold/40` resolves to `color-mix(in oklab, var(--gold) 40%, transparent)`,
  which covers the design's `--goldline`.

## Dependencies

| Package | Version | Role |
|---|---|---|
| `@base-ui-components/react` | ^1.0.0-rc.0 | headless accordion, switch, select, toggle group, field, navigation menu |
| `class-variance-authority` | ^0.7.1 | typed component variants |
| `clsx` | ^2 | conditional class composition |
| `tailwind-merge` | ^3.6 | last-wins conflict resolution in `cn()` |

All four are runtime `dependencies`.

**Base UI is at `1.0.0-rc.0`.** It is the Radix team's successor project and the
right long-term bet, but it is a release candidate. The exposure is bounded: it
supplies behaviour only — keyboard interaction, focus management, ARIA wiring —
and every visual is ours. The subpaths this spec depends on (`accordion`,
`switch`, `select`, `toggle-group`, `field`, `fieldset`, `separator`,
`navigation-menu`) were confirmed present in the published package. Pin the
minor; re-check at M3 when the submission form leans on `field` and `select`
much harder.

No `next-themes`. The pre-paint script below is eight lines, adds no dependency,
and the three-block CSS keeps no-JS users correct — which a JS-only provider
would not.

## Token layer

`app/globals.css` replaces the current Geist placeholder wholesale.

### Dark variant

Tri-state: an explicit choice wins in both directions; absent a choice, the
system preference decides.

```css
@custom-variant dark {
  &:where([data-theme=dark], [data-theme=dark] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme=light]) *) { @slot; }
  }
}
```

Palettes are declared three times to match: `:root` (light), then
`@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) }`, then
`[data-theme=dark]`. Never give a token its only definition inside a media or
attribute block.

### Colour

| Role token | Light | Dark |
|---|---|---|
| `--surface` | `#FAFAF8` | `#08080B` |
| `--surface-sunken` | `#F2F1EC` | `#0C0C10` |
| `--surface-raised` | `#FFFFFF` | `#141418` |
| `--ink` | `#0E0E0F` | `#F2F1EC` |
| `--ink-strong` | `#1A1A1C` | `#E8E7E1` |
| `--muted` | `rgb(14 14 15 / .60)` | `rgb(242 241 236 / .62)` |
| `--hairline` | `rgb(14 14 15 / .10)` | `rgb(255 255 255 / .14)` |
| `--hairline-faint` | `rgb(14 14 15 / .06)` | `rgb(255 255 255 / .08)` |
| `--gold` | `#B0883A` | `#CBA45A` |
| `--gold-ink` | `#836428` | `#CBA45A` |
| `--gold-bright` | `#C9A24B` | `#DDBC7A` |
| `--gold-soft` | `rgb(176 136 58 / .12)` | `rgb(203 164 90 / .16)` |
| `--gold-line` | `rgb(176 136 58 / .40)` | `rgb(203 164 90 / .55)` |
| `--on-gold` | `#160F02` | `#160F02` |

`--surface-raised` is opaque in both themes. Translucency is `--glass-bg`'s job,
and keeping them separate is what lets the reduced-transparency fallback below
actually be opaque.

`--on-gold` is constant — the ink used on a gold fill in both themes.

`--gold-ink` exists because of finding 4. **`--gold` is for fills, borders, and
decoration; `--gold-ink` is the only gold allowed as a text colour.** In light
it is the design gold darkened along the same hue ray to `#836428` (5.26:1 on
`--surface`, 4.86:1 on `--surface-sunken`); in dark the two are identical, so
the split costs nothing there. The visual difference on paper is small — it
reads as the same gold, slightly deeper — and it is the difference between a
compliant page and one that fails an audit at M8. Components must never use
`text-gold`; a lint rule is out of scope, so the `/design` gallery labels the
two swatches explicitly and the code review catches the rest.

Inverted regions (the design's `.dark` sections and the light-theme order
summary, which is ink-on-paper inside a paper page) get a `.surface-invert`
utility that redeclares `--surface`, `--ink`, `--muted`, and `--hairline`
locally. Nested components then theme correctly with no extra classes. In dark
theme the utility is close to a no-op, which is exactly the behaviour the design
shows.

### Glass

| Token | Light | Dark |
|---|---|---|
| `--glass-bg` | `rgb(255 255 255 / .70)` | `rgb(255 255 255 / .065)` |
| `--glass-bg-strong` | `rgb(255 255 255 / .85)` | `rgb(255 255 255 / .10)` |
| `--glass-border` | `rgb(14 14 15 / .08)` | `rgb(255 255 255 / .18)` |
| `--glass-highlight` | `rgb(255 255 255 / .60)` | `rgb(255 255 255 / .14)` |
| `--glass-blur` | `14px` | `24px` |
| `--glass-saturate` | `140%` | `160%` |

Two utilities, each bundling the five-property recipe:

```css
@utility glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1px 0 var(--glass-highlight);
}
```

`glass-strong` is the same with `--glass-bg-strong` and the elevated shadow.
Applied to: nav, slab, segmented control, pricing tier, form card, order
summary, steps grid, and chips. Same class in both themes — subtle frosted white
on paper, full liquid glass on black.

Accessibility and fallback:

```css
@media (prefers-reduced-transparency: reduce), (not (backdrop-filter: blur(1px))) {
  .glass, .glass-strong { background: var(--surface-raised); backdrop-filter: none; }
}
```

`backdrop-filter` on a `position: sticky` header is a known compositing cost on
low-end mobile. The nav uses `glass` with `will-change: backdrop-filter` omitted
deliberately — measure at M8 before adding it.

### Ambient glow

The dark variant layers three fixed radial blobs behind the page
(`filter: blur(130px)`, `opacity: .55`, `z-index: 0`):

| | Size | Colour | Position |
|---|---|---|---|
| 1 | 620px | `--gold` @ .42 | `top: -170px; left: -130px` |
| 2 | 720px | `--glow-cool` @ .24 | `top: 560px; right: -240px` |
| 3 | 560px | `--gold` @ .16 | `bottom: 240px; left: 32%` |

Glow 2 introduces a fourth hue absent from the palette — a muted slate-blue
`#6C7CA8`. It is tokenised as `--glow-cool` so it is a deliberate palette member
rather than a stray hex.

Rendered by `<AmbientGlow />` in the shell. `--glow-opacity` is themed: `.55` in
dark, `.18` in light (a faint gold wash, not the full effect). Set to `0` under
`prefers-reduced-transparency: reduce`. The element is `aria-hidden` and
`pointer-events: none`.

### Typography

Self-hosted via `next/font/google` — all three faces confirmed present in the
installed Next 16.3 font data. No `<link>` to Google's CDN, which also removes
the design file's two `preconnect` hints and the CLS they exist to mitigate.

| Family | Variable | Weights | Role |
|---|---|---|---|
| Newsreader | `--font-serif` | 400, 500, 600 | headings, numerals, prices, grades |
| Hanken Grotesk | `--font-sans` | 400, 500, 600, 700 | body, UI |
| JetBrains Mono | `--font-mono` | 400, 500 | eyebrows, labels, cert numbers, metadata |

The design's `Geist` / `Geist_Mono` wiring in `app/[locale]/layout.tsx` is
removed.

Scale. The design is fixed-width, so the display sizes are clamped rather than
copied — `66px` is unusable on a 375px viewport:

| Token | Value | Spec |
|---|---|---|
| `--text-display` | `clamp(2.5rem, 1.6rem + 3.8vw, 4.125rem)` | Newsreader 500, `lh 1.03`, `ls -.015em` |
| `--text-h2` | `clamp(1.875rem, 1.4rem + 2vw, 2.625rem)` | Newsreader 500, `lh 1.07`, `ls -.01em` |
| `--text-h3` | `1.375rem` | Newsreader 500, `lh 1.2` |
| `--text-lead` | `clamp(1.0625rem, 1rem + .3vw, 1.1875rem)` | `lh 1.6`, `--muted` |
| `--text-eyebrow` | `.75rem` | Mono, `ls .22em`, uppercase, `--gold` |
| `--text-kicker` | `.6875rem` | Mono, `ls .2em`, uppercase, `--muted` |
| `--text-label` | `.6875rem` | Mono, `ls .12em`, uppercase, `--muted` |
| `--text-meta` | `.625rem` | Mono, `ls .04em`, `--muted` |

The upper clamp bounds are the design's literal values, so desktop is a faithful
port and everything below it is new.

### Radius, shadow, layout

Radii, themed per finding 3 above:

| Token | Light | Dark |
|---|---|---|
| `--radius-control` | `9px` | `10px` |
| `--radius-card` | `13px` | `18px` |
| `--radius-panel` | `16px` | `22px` |
| `--radius-group` | `11px` | `13px` |

Shadows as themed tokens — `--shadow-card`, `--shadow-gold-btn`,
`--shadow-feature` — each carrying the design's literal recipe for its theme
(light: `0 1px 2px rgb(0 0 0 / .04), 0 26px 50px -30px rgb(0 0 0 / .4)`; dark:
`inset 0 1px 0 rgb(255 255 255 / .14), 0 30px 64px -32px rgb(0 0 0 / .75)`).

Layout: `--container: 1180px`, `--gutter: 2rem`, `--section-y: 6.5rem` (104px,
clamped down to `3.5rem` below `md`).

## Components

`lib/cn.ts` exports `cn()` = `twMerge(clsx(...))`. Every component takes
`className` and merges it last.

All are Server Components except where Base UI requires state; those carry
`"use client"` and are noted.

| Component | File | Notes |
|---|---|---|
| `Container` | `components/ui/container.tsx` | `--container` + `--gutter` |
| `Section` | `components/ui/section.tsx` | vertical rhythm; `invert` prop applies `.surface-invert` |
| `Button` | `components/ui/button.tsx` | CVA — `variant: gold \| ink \| ghost`, `size: md \| sm`. Renders `<button>` or, via `asChild`, the i18n `Link` |
| `Eyebrow` | `components/ui/eyebrow.tsx` | gold square dot + mono uppercase |
| `Kicker` | `components/ui/kicker.tsx` | muted mono uppercase |
| `Card` | `components/ui/card.tsx` | `variant: solid \| glass` |
| `Slab` | `components/slab/slab.tsx` | the signature object — brand bar, cert number, 5:7 window, footer caption, grade badge |
| `GradeBadge` | `components/slab/grade-badge.tsx` | split out; M4 Pop Report needs it standalone |
| `StatStrip` / `Stat` | `components/ui/stat.tsx` | rule-bounded numeral row |
| `SegmentedControl` | `components/ui/segmented-control.tsx` | **client** — Base UI `toggle-group` |
| `Field` | `components/ui/field.tsx` | Base UI `field` — label/control/error association, `Input` and `Select` subcomponents |
| `Switch` | `components/ui/switch.tsx` | **client** — Base UI `switch`, the iOS knob |
| `Accordion` | `components/ui/accordion.tsx` | **client** — Base UI `accordion`, `+`/`−` sign |
| `Chip` | `components/ui/chip.tsx` | pill, glass |

Every interactive element gets a visible `:focus-visible` ring using
`--gold-soft` at `3px`, matching the design's input focus treatment. The design
specifies no focus state at all for buttons or segmented controls; that is a gap
in the source, not a decision to reproduce.

Interactive targets are floored at 44×44 CSS px on coarse pointers. The design's
42px small button and 32px switch are below that; they get touch-target padding
rather than a size change, so the visual is preserved.

## Shell

| Component | Notes |
|---|---|
| `SiteHeader` | sticky, `glass`, 70px. Desktop link row; below `md` a Base UI `navigation-menu` drawer. All links from `@/i18n/navigation` |
| `SiteFooter` | inverted 4-column grid → 2 → 1, legal bar |
| `AmbientGlow` | the three blobs, `aria-hidden` |
| `ThemeToggle` | **client** — cycles light / dark / system, writes `localStorage.theme` and `document.documentElement.dataset.theme` |
| `ThemeScript` | blocking inline `<script>` in `<head>` |

`ThemeScript` runs before first paint to avoid a flash:

```js
try {
  var t = localStorage.theme;
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch {}
```

It stamps nothing when the user has expressed no preference, which is what lets
the `prefers-color-scheme` block stay authoritative. `suppressHydrationWarning`
goes on `<html>` because the script mutates it before React hydrates.

`app/[locale]/layout.tsx` gains the font wiring, `ThemeScript`, `AmbientGlow`,
`SiteHeader`, and `SiteFooter` around `{children}`.

## Responsive

The design has none; these breakpoints are new work. Tailwind defaults.

| Region | `base` | `md` | `lg` |
|---|---|---|---|
| Steps | 1 col | 2 | 4 |
| Showcase grid | 1 col | 2 | 4 |
| Pricing tiers | 1 col | 2 | 4 |
| Form + summary | stacked, summary last | stacked | `1.15fr .85fr`, summary sticky |
| Hero B | stacked | stacked | 2 col |
| Footer | 1 col | 2 | `2fr 1fr 1fr 1fr` |
| Nav | drawer | drawer | inline links |
| Stat strip | 2×2 | row | row |

The order summary is `position: sticky` only from `lg`; sticky inside a stacked
mobile column traps the viewport.

## Content & i18n

Nav labels, footer headings and links, and the theme toggle's accessible names
go into `messages/en.json` under `nav`, `footer`, and `a11y`. The existing `nav`
block already has `home`, `howItWorks`, `popReport`, `faq`, `submit`, `signIn`;
`showcase` and `pricing` are added to match the design's nav.

Note that the design's nav (`How it works · Showcase · Pricing · FAQ`) and the
project's information architecture (`Pop Report`) disagree. `Showcase` in the
design *is* the Pop Report surface under a marketing name. The nav key stays
`popReport`; only its English string is up for discussion with the client.

**The `/design` gallery is exempt from the no-hardcoded-strings rule.** It is
internal tooling, its labels are token names and component names, and
translating "Buttons" is pure cost. This exemption is documented in `CLAUDE.md`
next to the existing `app/global-error.tsx` one, so it reads as a decision
rather than an oversight.

## The `/design` gallery

`app/[locale]/design/page.tsx`, composed from section components under
`app/[locale]/design/_sections/`. Renders colour swatches with their resolved
values, the type scale, radii, shadows, glass surfaces, and every component in
every variant and state — including disabled and focus.

It sits inside `[locale]` deliberately: it must render through the real layout,
the real fonts, and the real `NextIntlClientProvider` to be worth anything.

It is excluded from `sitemap` and carries `robots: { index: false }` via
`generateMetadata`. It is not behind an environment check — a components page
leaks nothing, and gating it means it stops working exactly where you most want
to check a rendering bug, which is production.

## Testing

Per the conventions in `CLAUDE.md`: colocated, `renderWithIntl`, `globals: false`,
never assert copy as a literal.

| Test | Asserts |
|---|---|
| `components/ui/button.test.tsx` | each variant renders, `asChild` produces an anchor, `disabled` blocks click |
| `components/ui/segmented-control.test.tsx` | selection changes, arrow-key roving focus, `aria-checked` |
| `components/ui/accordion.test.tsx` | opens and closes, sign flips, `aria-expanded` |
| `components/ui/switch.test.tsx` | toggles, `role="switch"`, `aria-checked` |
| `components/ui/field.test.tsx` | label is associated with the control |
| `components/slab/slab.test.tsx` | renders cert, caption, and grade from props |
| `lib/cn.test.ts` | later Tailwind class wins over an earlier conflicting one |

Two Node-environment tests (`// @vitest-environment node` on line 1) guard the
token layer itself:

- `app/globals.token.test.ts` parses `app/globals.css` and asserts every token
  declared in `:root` also has a value in the `[data-theme=dark]` block, and
  vice versa. This catches the actual recurring failure mode — a token added to
  one theme and forgotten in the other.
- `components/gold-ink.test.ts` scans `components/**` and `app/**` for
  `text-gold` used without the `-ink` suffix, and fails on a hit. Cheap, and it
  is the only automated defence for finding 4; without it the split silently
  erodes the first time someone types the shorter class name.

Both are text assertions on source, not rendered ones. jsdom does not implement
`backdrop-filter` and does not resolve custom properties through `@theme`, so no
test here claims to verify visual output.

`SiteHeader` and `layout.tsx` are not unit-tested — async Server Components,
which Vitest structurally cannot render. E2E at M8.

## Verification

1. `npm run lint` — clean.
2. `npm run build` — succeeds; both locales still prerender as static HTML.
3. `npx tsc --noEmit` — clean, after the build (route types are generated during it).
4. `npm test` — all green.
5. `/design` renders in both themes; toggling produces no flash on reload.
6. `/design` at 375px, 768px, and 1440px — no horizontal scroll at any width.
7. Contrast. Measured for this spec, so implementation only has to confirm the
   tokens shipped are the tokens specified:

   | Pair | Light | Dark |
   |---|---|---|
   | `ink` on `surface` | 18.46 | 17.69 |
   | `muted` on `surface` | 5.00 | 6.97 |
   | `muted` on `surface-sunken` | 4.87 | — |
   | `on-gold` on `gold` | 5.83 | 8.15 |
   | `gold-ink` on `surface` | 5.26 | 8.57 |
   | ~~`gold` on `surface`~~ | ~~3.13~~ | ~~8.57~~ |

   All shipping pairs clear AA (4.5:1). The struck row is the source design's
   behaviour and is the reason `--gold-ink` exists; it must not appear in the
   built CSS as a text colour. `--muted` passes at 5.00 without adjustment — no
   deviation needed there.

## Known gaps

- **Base UI is a release candidate.** Breaking changes are possible before 1.0.
  Bounded to behaviour, not visuals. Re-evaluate at M3.
- **No visual regression testing.** Nothing here catches a token change that
  makes a component ugly but still renders. Out of budget at M1; a candidate for
  M8 if the page count justifies it.
- **The slab window is a placeholder.** The design ships a CSS hatch pattern
  where the card image goes. Real images arrive with R2 in M3; the `Slab`
  component takes an optional `image` prop now and falls back to the hatch.
- **Print styles.** The design project contains three `-print-` variants that
  were not read for this spec. Cert printing may matter for M5; not now.
- **`prefers-contrast: more`** is unhandled. Glass at high contrast is a real
  problem and this spec only addresses reduced *transparency*, not increased
  contrast.
