# Brand identity adoption

**Date:** 2026-09-08
**Status:** Proposed — needs client approval before implementation
**Module:** M1 — Design system & public pages (rework)

## Goal

Adopt the professional brand identity in `docs/ART-Gradings-FullHd-kf_v6.pdf`
("ART – Authentic. Rated. Trusted / Arculati alapvetés, IV. szakasz", Kiss
Ferenc) into the shipped design system: the logo, the colour accord, the
typefaces, and the slab label.

This is the brand layer that `CLAUDE.md` and the estimate both list as **out of
scope** and that the design system therefore fakes — the wordmark is a
typographic placeholder and the palette was picked from the Claude Design file,
not from a brand book. The deck supersedes both.

The deliverable is a re-skinned design system, not new pages.

## Non-goals

- **Re-architecting the design system.** Semantic token indirection, the glass
  treatment, themed radii, the primitives, the shell, and the `/design` gallery
  all stand. This spec changes token *values* inside an existing contract and
  swaps two font families. If it turns into a structural change, it has gone
  wrong.
- **Making dark the dominant surface.** See "Decisions taken" below.
- **The public pages.** Landing, How it works and FAQ are specced
  (`2026-09-01-landing-page-design.md`, approved, not yet implemented) and are
  built after this, on top of it.
- **Redrawing anything.** The deck's artwork is vector and is used as-is.
- **The construction grids** (deck pp. 11–12). Those are the designer's
  proportional method for redrawing the mark at any size. We embed the vector;
  we never reconstruct it.
- **Merch** (deck p. 16, a t-shirt mockup).
- **Writing the gas-fill claim.** Product claims are client-supplied per
  `CLAUDE.md`. This spec places the copy; it does not author it.

## Source analysis

32 pages, Hungarian, four sections: logo (pp. 3–18), colour (pp. 19–27),
typography (pp. 28–30), slab label (pp. 31–32). It is a brand manual — there
are **no screens, no components, and no layouts** in it, so it does not
overlap with the design system except at the token layer.

Six findings drive the decisions below.

**1. The logo is vector, not raster.** `pdfimages -list` finds embedded images
on only three pages — p. 8 (a photograph), pp. 11–12 (screenshots of the
construction grid). Every logo page is vector art. `pdftocairo -svg` extracts
the geometry exactly, so there is no tracing and no fidelity loss:

| Page | Extract | Contents |
|---|---|---|
| 9 | minimal mark | `ART` letterforms, single colour |
| 5 | full lockup | frame + `AUTHENTIC. RATED. TRUSTED` |
| 17 | gas-fill shield | shield + check |

Each carries the slide's own header furniture and needs trimming, but the mark
itself is production geometry.

**2. The brand black is a blue-black, and the deck never states its hex.**
Sampled off p. 26 at `#1A1D29` — hue 228°, 22% saturation, 13% lightness. Our
`--ag-ink` / dark `--ag-surface` are neutral (`#0E0E0F`, `#08080B`). p. 20 is
titled "the primary colour is ART REACH BLACK", shows a row of cool grey
swatches, and prints `#A47E1B` — the gold — underneath it. That page is
internally inconsistent; the sampled value is the only usable evidence, and it
should be confirmed with the designer (see open questions).

**3. The gold ramp splits exactly along the line we already enforce.** The
"Golden Harvest Glow" accord (p. 21) is five steps. Measured against our light
surface and the brand black:

| Step | on `#FAFAF8` | on `#1A1D29` |
|---|---|---|
| `#805B10` | **5.87** | 2.73 |
| `#A47E1B` | 3.60 | 4.46 |
| `#C9A227` | 2.31 | **6.94** |
| `#EDC531` | 1.59 | 10.09 |
| `#FFE169` | 1.24 | 12.96 |

Only the deepest step is legible as text on paper; only the bright steps are
legible on black. That is precisely the `--gold` (fills, borders, decoration)
vs `--gold-ink` (the one gold allowed as text) split that finding 4 of the
design system spec forced on us and that `components/gold-ink.test.ts`
enforces. **The rebrand validates the architecture rather than straining it**,
and the whole change lands as new values in the existing token slots.

**4. The deck's body face is not on Google Fonts under that name.** `pdffonts`
shows the samples set in Source Sans **Pro**, which Google retired in favour of
**Source Sans 3**. Verified against the installed Next 16.3 font data:
`Source Sans 3` present (weights 200–900 + variable, normal + italic),
`Source Sans Pro` absent. The substitution is the intended successor family,
not an approximation.

**5. "Playfair SemiCondensed" is a width axis, not a separate family.** The
deck's display face (p. 30) is *Playfair*, not Playfair Display. The installed
font data gives Playfair three axes — `opsz` 5–1200, `wdth` 87.5–112.5, `wght`
300–900. SemiCondensed is `wdth: 87.5`, the axis minimum, reachable through
`next/font/google`'s `axes` option plus `font-stretch`.

**6. The deck sets the tagline two different ways.** p. 26 renders
`AUTHENTIC. RATED. TRUSTED` as one gold sans line; p. 27 stacks it over three
lines with "Trusted" in a Playfair italic. Both are labelled the same. One has
to be picked — see open questions.

Also worth recording: p. 32 places our slab beside a TAG holder under an arrow.
TAG is the deck's explicit benchmark, which is a useful sanity check for the
Pop Report and slab work in M4.

## Decisions taken

Two questions were open after the initial read of the deck. Both are now
settled and are recorded here because neither is recoverable from the code.

**Light stays the dominant surface.** The deck's 60/30/10 guidance (pp. 23–25)
makes the brand black the 60. We are not following that. Light remains the
product default, dark remains opt-in via `data-theme="dark"`, and
`prefers-color-scheme` continues not to participate. The ratio applies *within*
dark bands — `surface-invert` regions and the dark theme — not to the site.

The consequence is the thing that makes this spec cheap: the brand black
becomes the value of our existing dark surfaces rather than the page ground, so
no page changes structurally.

**"GAS PROTECT" is a product feature, not a sub-brand.** It means the slab is
filled with inert gas to preserve the card. It is therefore **not** a co-brand,
belongs nowhere in the header or footer as a lockup, and the shield is a
feature icon. It earns a feature block on the landing page and a step in How it
works, both carrying client-supplied copy. Given p. 32 benchmarks us against
TAG, this is the one line in the deck that is a genuine differentiator, so it
should be visible rather than decorative.

## Colour

The brand black replaces the neutral black everywhere dark already appears —
the dark theme *and* `surface-invert` in light. One brand black, two contexts.

Dark ramp derived from `#1A1D29` along its own hue and saturation:

| Role token | Light — now | Light — proposed | Dark — now | Dark — proposed |
|---|---|---|---|---|
| `--ag-surface` | `#FAFAF8` | *unchanged* | `#08080B` | `#1A1D29` |
| `--ag-surface-sunken` | `#F2F1EC` | *unchanged* | `#0C0C10` | `#161822` |
| `--ag-surface-raised` | `#FFFFFF` | *unchanged* | `#141418` | `#222535` |
| `--ag-ink` | `#0E0E0F` | `#1A1D29` | `#F2F1EC` | *unchanged* |
| `--ag-ink-strong` | `#1A1A1C` | `#262B3C` | `#E8E7E1` | *unchanged* |
| `--ag-gold` | `#B0883A` | `#A47E1B` | `#CBA45A` | `#C9A227` |
| `--ag-gold-ink` | `#836428` | `#805B10` | `#CBA45A` | `#C9A227` |
| `--ag-gold-bright` | `#C9A24B` | `#C9A227` | `#DDBC7A` | `#EDC531` |
| `--ag-invert-surface` | `#0E0E0F` | `#1A1D29` | `transparent` | *unchanged* |
| `--ag-invert-surface-raised` | `#1A1A1C` | `#222535` | `#141418` | `#222535` |
| `--ag-invert-gold-ink` | `#B0883A` | `#C9A227` | `#CBA45A` | `#C9A227` |

`--ag-muted`, `--ag-hairline*` and `--ag-invert-*` alpha values re-derive from
whichever of `ink` / `surface` they are stated in terms of; `--ag-on-gold`
(`#160F02`) is unchanged and still passes on the new gold (5.06:1 on `#A47E1B`,
7.87:1 on `#C9A227`). `--ag-gold-soft` and `--ag-gold-line` restate their alpha
recipes against the new base — `rgb(164 126 27 / …)` in light, `rgb(201 162 39
/ …)` in dark. The two gold shadow recipes in `--ag-shadow-gold` and
`--ag-shadow-feature` do the same.

`--ag-glow-cool` (`#6C7CA8`) stays. It was chosen against a neutral black and
happens to sit at 222°, within 6° of the brand black's hue — it harmonises
better after this change than before it.

Verified contrasts on the proposed values:

| Pair | Ratio |
|---|---|
| `--ink` `#F2F1EC` on dark `--surface` `#1A1D29` | 14.84 |
| `--ink` on dark `--surface-raised` `#222535` | 13.42 |
| `--muted` on dark `--surface` | 9.16 |
| `--gold-ink` `#805B10` on light `--surface` | 5.87 |
| `--gold-ink` on light `--surface-sunken` `#F2F1EC` | 5.43 |
| `--gold-ink` `#C9A227` on dark `--surface` | 6.94 |
| `--gold-ink` on dark `--surface-raised` | 6.27 |
| `--on-gold` on `--gold-fill`, light / dark | 5.06 / 7.87 |

Every text pairing clears 4.5:1. The light gold-ink improves on what shipped
(5.87 vs 5.26) and the dark gold-ink drops but stays compliant (6.94 vs 8.57).

**The light surface stays warm.** `#FAFAF8` has a faint warm cast and the brand
black is cool. The deck specifies no light background hex anywhere — its light
slides are plain white — so there is nothing to conform to, and changing it
would churn every glass and shadow recipe for a difference measured in one or
two units per channel. Recommendation: keep it. If the client reads the pairing
as mismatched, neutralising the paper is a one-token follow-up.

## Typography

Both families are on Google Fonts and self-host through `next/font/google`, so
this is a swap inside `app/[locale]/layout.tsx` with no downstream change — the
`--ag-font-sans` / `--ag-font-serif` indirection absorbs it.

| Family | Variable | Now | Proposed |
|---|---|---|---|
| sans — body, UI | `--ag-font-sans` | Hanken Grotesk | **Source Sans 3** |
| serif — headings, numerals, grades | `--ag-font-serif` | Newsreader | **Playfair** |
| mono — eyebrows, cert numbers, meta | `--ag-font-mono` | JetBrains Mono | *unchanged* |

The deck names no monospace face. JetBrains Mono stays; the eyebrow/label/meta
scale is ours, not the deck's.

Both proposed families ship variable, so `weight` stays omitted exactly as the
current three do. Playfair additionally needs its width axis requested to reach
the deck's SemiCondensed setting:

```ts
const serif = Playfair({
  variable: "--ag-font-serif",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],          // opsz and wdth are opt-in; wght comes free
});
```

`font-stretch: 87.5%` then selects SemiCondensed where the deck uses it. Note
that requesting an axis grows the file — apply it to display headings only, not
to the base `--font-serif` mapping, so body-adjacent serif text keeps the
default width.

The type **scale** is unchanged. The deck gives specimens, not a scale, and the
clamped display sizes in the design system spec are tuned for our breakpoints.
Playfair is a higher-contrast, smaller-x-height face than Newsreader, so
expect the display sizes to need a visual re-check at the top clamp bound —
a tuning pass, not a re-spec.

## The logo

`components/layout/wordmark.tsx` currently renders `Art` in the serif face plus
a gold full stop, with a comment explaining that brand identity is out of
scope. That premise no longer holds; the component is replaced by the
designer's mark.

Extract, trim to the artwork, and commit as static SVG under
`components/layout/`:

- **`art-mark.svg`** — the minimal `ART` (p. 9). Header, footer, favicon.
  `currentColor` fill, so the existing inverse handling is a colour cascade
  rather than a second asset (deck p. 6 shows normal and inverse as the same
  geometry).
- **`art-lockup.svg`** — the framed mark plus the fixed tagline (pp. 5, 13).
  For the footer and metadata images, where the tagline has room.
- **`gas-shield.svg`** — the shield (p. 17), as a feature icon.

Inline them as React components rather than `<img>`: they must inherit
`currentColor` and they are small enough that a request each is worse than the
bytes.

Two knock-ons:

- **The `text-gold` allowlist in `components/gold-ink.test.ts` can shrink.**
  It exists solely because the placeholder wordmark's gold full stop needed a
  WCAG 1.4.3 logotype exemption. The real mark is monochrome and takes its
  colour from context, so the exemption is no longer needed and the allowlist
  should go to empty — the rule gets *stricter*, which is the right direction.
- **The `Slab` header's gold dot** (`components/slab/slab.tsx`) was standing in
  for a mark. It is replaced by the real one, below.

The deck's mark-interrupting-a-rule device (p. 7) is a section divider and
should be added to the primitives as such; it is the deck's one piece of
layout-adjacent guidance and it is what the physical label uses.

## The slab label

pp. 8 and 32 specify the physical holder label. `Slab` currently renders a gold
dot + `ART` + cert on one row, which was an invention. The real layout, top to
bottom:

1. A full-width hairline rule, **interrupted at centre** by the `ART` mark
   knocked out in a light box — the p. 7 device, at label scale.
2. Left block, four lines, uppercase, tight leading:
   name (native script + latin, e.g. `コイキング | MAGIKARP`) · year + set ·
   set number (`TRIPLET BEAT #080/073`) · rarity (`ART RARE`).
3. Right block: QR code, then the cert serial set **vertically** beside it,
   then the grade numeral at display size with its label beneath
   (`10` over `GEM MINT`).
4. The card window.
5. The gas-fill shield at the foot of the case.

Two things fall out of this that matter beyond styling:

- **The label's left block is M3's card form, plus one field.** Name, set, set
  number and release year are exactly the four required per-card fields in M3.
  **Rarity is on the label but is not collected at submission.** Either M3 grows
  a rarity field or the label drops the line. Flagging rather than deciding —
  it is a scope question for the client, and it is cheaper to answer now than
  after the submission form is built.
- **The grade numeral and its label are one unit.** `GradeBadge` already models
  `grade` + `label`; the label spec confirms that pairing and gives it its
  typographic proportions.

`SlabData` gains `number` and (pending the above) `rarity`. Fixtures in
`components/slab/fixtures.ts` update to match; they stay obviously synthetic per
the fixtures rule.

## The gas fill

Placement only — the copy is the client's.

| Surface | Treatment |
|---|---|
| Landing | A feature block. `Showcase` in the landing spec is the natural host. |
| How it works | A step: the card is sealed under inert gas. |
| Slab | The shield at the foot of the case, as on the physical holder. |
| Header / footer | **Nothing.** It is not a brand. |

Copy goes in `messages/en.json` like everything else. Until the client supplies
it, it is tracked as placeholder content by the mechanism the landing page spec
already defines for exactly this.

## Sequencing

Three commits, each independently revertable, in dependency order:

1. **Logo and typography.** Extract and commit the SVGs, replace `Wordmark`,
   swap the two font families, shrink the `gold-ink` allowlist. Touches no
   colour. This is the half that needs no approval — it replaces a placeholder
   the estimate had already conceded and swaps two Google fonts.
2. **Colour.** The token tables above, in `app/globals.css` only. Both palette
   blocks move together or `globals.token.test.ts` fails, which is the point of
   that test.
3. **The slab label.** `Slab`, `GradeBadge`, `SlabData`, fixtures. Gated on the
   rarity question.

Then the landing page, How it works and FAQ are built on the rebranded system.

**Do this before those pages, not after.** They are specced and approved but
unimplemented, which is the cheapest moment this change will ever have: every
page built first is a page rebranded twice.

## Testing

No new test infrastructure.

- **`app/globals.token.test.ts`** — asserts every `:root` token is redeclared
  under `[data-theme="dark"]` and vice versa. Structural, so it should pass
  unchanged; if it fails, a token was dropped rather than revalued.
- **`components/gold-ink.test.ts`** — the allowlist shrinks to empty, and this
  is **forced, not optional**: its second test asserts every allowlisted path
  still exists, precisely so a rename cannot silently widen the exception.
  Replacing `wordmark.tsx` fails that test until the entry is removed. The
  guard behaves exactly as designed — the rebrand is the rename it was written
  to catch.
- **`components/slab/slab.test.tsx`** — updates with the label layout and the
  new `SlabData` fields.

**`site-header.test.tsx` and `site-footer.test.tsx` need no change, and that is
the problem.** Neither asserts anything about the wordmark. The header renders
`<Link href="/"><Wordmark /></Link>`, so the home link's entire accessible name
is the wordmark's text node — `Art`, with the gold full stop already
`aria-hidden`. Swapping in an inline SVG **deletes that accessible name** and
leaves an unnamed link, and no existing test would notice.

So the mark must carry its own name — a `<title>` in the SVG or an `aria-label`
on the link — and the header suite gains the assertion that is missing today:

```ts
expect(screen.getByRole("link", { name: /art/i })).toHaveAttribute("href", "/");
```

Contrast is verified by calculation in this spec rather than by a test. A
contrast unit test over the token layer is a genuinely good idea and a
candidate for M8; it is not in this budget.

## Verification

- `npm test`, `npm run lint`, `npm run build` clean.
- `/design` renders every token and primitive on the new palette, in both
  themes, with the two swatches still labelled `--gold` and `--gold-ink`.
- The mark renders correctly on paper, on `surface-invert`, and in dark theme —
  three contexts, one asset, `currentColor`.
- The header's home link still has an accessible name, asserted by the new test
  above and confirmed in the accessibility tree, not just by reading the JSX.
- Spot-check the display clamp bound in Playfair at 1180px and at 375px.
- No `text-gold` outside the (now empty) allowlist.

## Cost and approval

Roughly **10–14 hours**: 3–4 for logo and fonts, 3–4 for the palette and its
`/design` re-check, 4–6 for the slab label. Against M1's 96h budget, in a
module already largely delivered.

This is **rework of approved, demoed work**, and the estimate names scope creep
as the project's top risk. It should be an explicit client decision with the
deck attached, not absorbed quietly — the argument for saying yes is that the
alternative is shipping a placeholder wordmark and a palette that contradicts
the brand manual the client commissioned.

Commit 1 is defensible without that conversation; commits 2 and 3 are not.

## Open questions

For the designer:

- **The brand black's hex.** `#1A1D29` is sampled from a rendered page, not
  stated. p. 20 gives the gold's hex under a heading about the black.
- **Source vector files.** AI/EPS/SVG would beat extraction — mainly for
  correct fill rules and a clean viewBox, not for geometry.
- **Which tagline setting is canonical**, p. 26 (one gold sans line) or p. 27
  (three lines, Playfair italic "Trusted").
- **Minimum clear space and minimum size** for the mark. The deck shows a
  protective frame but states no measurements, and the header will render it
  small.

For the client:

- The gas-fill claim, in their words — what the gas does and what it prevents.
- **Rarity**: collected at submission, or dropped from the label.
- Whether the warm paper stays or neutralises against the cool black.

## Known gaps

- **No visual regression testing**, so nothing mechanically catches a palette
  change that renders correctly but reads wrong. Unchanged from M1; the
  `/design` gallery and review are the control.
- **The extracted SVGs are a derivation.** They are geometrically exact but
  reconstructed by `pdftocairo`; fill rules on the counters should be eyeballed
  at large size before the source files arrive.
- **The deck's four-colour lockup** (p. 14, gold field + white mark + black
  tagline) has no obvious home on the site and is not adopted. It is a
  print/merch treatment.
- **Print styles** remain unaddressed, now with a real mark to print. Still M5
  at the earliest, if cert printing matters.
