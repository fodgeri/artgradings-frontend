# Brand identity adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder wordmark, typefaces and Claude-Design-derived palette with the professional brand identity from `docs/ART-Gradings-FullHd-kf_v6.pdf`.

**Architecture:** Value-level change inside the existing token contract. The semantic `--ag-*` indirection, glass treatment, themed radii, primitives and `/design` gallery are untouched; only token *values* and two font families change. The logo becomes real vector geometry extracted from the deck and inlined as a React component so it inherits `currentColor`.

**Tech Stack:** Next 16.3, Tailwind v4 (`@theme inline`), `next/font/google`, Vitest 4 + RTL.

**Spec:** `docs/superpowers/specs/2026-09-08-brand-identity-adoption-design.md`

## Global Constraints

- **Light is the default.** Dark is opt-in via `data-theme="dark"` on `<html>`. `prefers-color-scheme` does not participate. The deck's 60/30/10 applies inside dark bands only, never to the site.
- **Every token in `:root` must be redeclared in `[data-theme="dark"]`** and vice versa — `app/globals.token.test.ts` enforces both directions.
- **`--ag-gold` is fills, borders and decoration. `--ag-gold-ink` is the only gold allowed as text.** Never write `text-gold`; `components/gold-ink.test.ts` enforces it.
- **Raw tokens are `--ag-*`;** Tailwind namespaces map from them in `@theme inline`. Never `--radius-card: var(--radius-card)`.
- **No hardcoded user-facing strings** outside `app/global-error.tsx` and `app/[locale]/design/`. Copy lives in `messages/en.json`.
- **Tests are colocated;** import `describe`/`test`/`expect` from `vitest` (`globals: false`); component tests go through `renderWithIntl` from `@/test/i18n`.
- **GAS PROTECT is a product feature, not a brand.** The shield is a feature icon. It appears in no header or footer lockup.
- Brand black `#1A1D29`. Gold accord `#805B10 · #A47E1B · #C9A227 · #EDC531 · #FFE169`.

---

### Task 1: Brand assets and the real mark

Replaces the typographic `Art.` placeholder with the designer's vector mark, and closes the accessible-name gap that swap opens.

**Files:**
- Create: `components/layout/art-mark.svg.ts` (path data constant)
- Modify: `components/layout/wordmark.tsx` (full rewrite)
- Modify: `components/gold-ink.test.ts:20` (allowlist → empty)
- Modify: `components/layout/site-header.test.tsx` (add accessible-name test)
- Create: `components/layout/gas-shield.tsx`
- Modify: `messages/en.json` (add `brand.markLabel`)

**Interfaces:**
- Consumes: nothing.
- Produces: `<Wordmark className?: string />` — unchanged call signature, so `site-header.tsx:25` and `site-footer.tsx:41` keep working untouched. `<GasShield className?: string />`.

- [x] **Step 1: Add the accessible-name test that must fail**

In `components/layout/site-header.test.tsx`, add inside the existing `describe`:

```tsx
test("the home link keeps an accessible name", () => {
  renderWithIntl(<SiteHeader />);
  expect(screen.getByRole("link", { name: /art/i })).toHaveAttribute("href", "/");
});
```

- [x] **Step 2: Run it — it passes today, and that is the point**

Run: `npx vitest run components/layout/site-header.test.tsx`
Expected: PASS. The placeholder's text node currently supplies the name. This test is the tripwire for Step 4 — it will fail the moment the text is replaced by an SVG without a label, which is the regression being guarded.

- [x] **Step 3: Commit the tripwire**

```bash
git add components/layout/site-header.test.tsx
git commit -m "test: pin the header home link's accessible name"
```

- [x] **Step 4: Add the mark's path data**

Create `components/layout/art-mark.svg.ts`. Geometry extracted from deck p. 9 with `pdftocairo -svg`, normalised to a tight viewBox — 11 closed polygons, all straight lines:

```ts
/**
 * The `ART` logotype, from the brand manual (deck p. 9), extracted as vector.
 *
 * Eleven simple closed polygons whose union forms the mark; the counters of
 * `A` and `R` are negative space between them, so no fill rule is load-bearing
 * and the default `nonzero` is correct.
 */
export const ART_MARK_VIEWBOX = "0 0 1099.48 251.31";
export const ART_MARK_PATHS = [
  /* filled in Step 5 from scratchpad/art-mark.svg */
];
```

- [x] **Step 5: Generate the path data**

The cleaned asset already exists at `scratchpad/art-mark.svg`. Emit its `d` attributes as the array literal:

```bash
python3 - <<'PY' >> components/layout/art-mark.svg.ts
import re
s = open("/tmp/.../scratchpad/art-mark.svg").read()
for d in re.findall(r'<path d="([^"]*)"/>', s):
    print(f'  "{d}",')
PY
```

Then close the array by hand. Verify the file parses: `npx tsc --noEmit -p tsconfig.json` after the build.

- [x] **Step 6: Rewrite the wordmark**

Replace `components/layout/wordmark.tsx` entirely:

```tsx
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

import { ART_MARK_PATHS, ART_MARK_VIEWBOX } from "./art-mark.svg";

/**
 * The ART logotype from the brand manual.
 *
 * Monochrome and `currentColor`, so light, dark and `surface-invert` are one
 * asset and a colour cascade — the deck shows normal and inverse as identical
 * geometry (p. 6).
 *
 * The `<title>` is load-bearing: the header renders this inside the home
 * link, so it is that link's entire accessible name.
 */
export function Wordmark({ className }: { className?: string }) {
  const t = useTranslations("brand");
  return (
    <svg
      viewBox={ART_MARK_VIEWBOX}
      role="img"
      className={cn("h-[18px] w-auto text-ink", className)}
      fill="currentColor"
    >
      <title>{t("markLabel")}</title>
      {ART_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
```

- [x] **Step 7: Add the message key**

In `messages/en.json`, add a `brand` object: `{ "markLabel": "ART — Authentic. Rated. Trusted" }`.

- [x] **Step 8: Empty the gold-ink allowlist**

`components/gold-ink.test.ts:20` — the exemption existed only for the placeholder's gold full stop. The real mark is monochrome:

```ts
const LOGOTYPE_ALLOWLIST: string[] = [];
```

Its second test asserts every allowlisted path exists, so this edit is **forced**, not optional — leaving the stale entry fails the suite.

- [x] **Step 9: Add the gas-fill shield**

Create `components/layout/gas-shield.tsx` from `scratchpad/gas-shield.svg` (deck p. 17). Two subpaths with opposite winding, so the check knocks out under the default `nonzero` — verified by rasterising, do not add `fill-rule`:

```tsx
import { cn } from "@/lib/cn";

/**
 * The gas-fill shield. GAS PROTECT is a product feature — the slab is filled
 * with inert gas — not a sub-brand, so this is a feature icon and never a
 * lockup in the header or footer. Decorative by default; the copy beside it
 * carries the meaning.
 */
export function GasShield({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 99 123.7" aria-hidden className={cn("size-4", className)} fill="currentColor">
      <path d="…" />
    </svg>
  );
}
```

- [x] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS, including the Step 1 tripwire — proving the `<title>` supplies the name the text node used to.

- [x] **Step 11: Commit**

```bash
git add components/layout/ components/gold-ink.test.ts messages/en.json
git commit -m "feat: adopt the ART logotype from the brand manual"
```

---

### Task 2: Typefaces

**Files:**
- Modify: `app/[locale]/layout.tsx:2,16-31`

**Interfaces:**
- Consumes: nothing.
- Produces: `--ag-font-sans` → Source Sans 3, `--ag-font-serif` → Playfair. Both consumed by `@theme inline` in `app/globals.css:188-189`; no component changes.

- [x] **Step 1: Swap the imports and loaders**

`app/[locale]/layout.tsx` line 2 becomes:

```ts
import { JetBrains_Mono, Playfair, Source_Sans_3 } from "next/font/google";
```

and the two loaders:

```ts
// Playfair carries opsz/wdth/wght. `wdth` is requested because the brand
// manual sets display type SemiCondensed (p. 30) — that is the axis minimum,
// 87.5, not a separate family. `opsz` is left at its default.
const serif = Playfair({
  variable: "--ag-font-serif",
  subsets: ["latin"],
  display: "swap",
  axes: ["wdth"],
});

const sans = Source_Sans_3({
  variable: "--ag-font-sans",
  subsets: ["latin"],
  display: "swap",
});
```

`mono` (JetBrains Mono) is unchanged — the deck names no monospace face.

- [x] **Step 2: Build**

Run: `npm run build`
Expected: PASS. A wrong family name or an unsupported axis fails here, not at runtime.

- [x] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS — no test asserts a font family.

- [x] **Step 4: Commit**

```bash
git add app/\[locale\]/layout.tsx
git commit -m "feat: adopt Source Sans 3 and Playfair per the brand manual"
```

---

### Task 3: Palette

Brand black replaces neutral black everywhere dark already appears — the dark theme *and* `surface-invert` in light. One brand black, two contexts. No page changes structurally.

**Files:**
- Modify: `app/globals.css:29-90` (`:root`), `app/globals.css:98-160` (`[data-theme="dark"]`)

**Interfaces:**
- Consumes: nothing.
- Produces: revalued tokens only. No token added or removed, so `@theme inline` and every component are untouched.

- [x] **Step 1: Revalue the light block**

In `:root`:

| Token | From | To |
|---|---|---|
| `--ag-ink` | `#0e0e0f` | `#1a1d29` |
| `--ag-ink-strong` | `#1a1a1c` | `#262b3c` |
| `--ag-muted` | `rgb(14 14 15 / 0.6)` | `rgb(26 29 41 / 0.6)` |
| `--ag-hairline` | `rgb(14 14 15 / 0.1)` | `rgb(26 29 41 / 0.1)` |
| `--ag-hairline-faint` | `rgb(14 14 15 / 0.06)` | `rgb(26 29 41 / 0.06)` |
| `--ag-gold` | `#b0883a` | `#a47e1b` |
| `--ag-gold-ink` | `#836428` | `#805b10` |
| `--ag-gold-bright` | `#c9a24b` | `#c9a227` |
| `--ag-gold-soft` | `rgb(176 136 58 / 0.12)` | `rgb(164 126 27 / 0.12)` |
| `--ag-gold-line` | `rgb(176 136 58 / 0.4)` | `rgb(164 126 27 / 0.4)` |
| `--ag-invert-surface` | `#0e0e0f` | `#1a1d29` |
| `--ag-invert-surface-raised` | `#1a1a1c` | `#222535` |
| `--ag-invert-gold-ink` | `#b0883a` | `#c9a227` |
| `--ag-glass-border` | `rgb(14 14 15 / 0.08)` | `rgb(26 29 41 / 0.08)` |
| `--ag-shadow-gold` | `…rgb(176 136 58 / 0.9)` | `…rgb(164 126 27 / 0.9)` |
| `--ag-shadow-feature` | `…rgb(176 136 58 / 0.55)` | `…rgb(164 126 27 / 0.55)` |

`--ag-surface*`, `--ag-on-gold`, `--ag-glow-cool`, radii and `--ag-shadow-card` are unchanged. The light surface stays warm — the deck specifies no light background hex.

- [x] **Step 2: Revalue the dark block**

In `[data-theme="dark"]`:

| Token | From | To |
|---|---|---|
| `--ag-surface` | `#08080b` | `#1a1d29` |
| `--ag-surface-sunken` | `#0c0c10` | `#161822` |
| `--ag-surface-raised` | `#141418` | `#222535` |
| `--ag-gold` | `#cba45a` | `#c9a227` |
| `--ag-gold-ink` | `#cba45a` | `#c9a227` |
| `--ag-gold-bright` | `#ddbc7a` | `#edc531` |
| `--ag-gold-soft` | `rgb(203 164 90 / 0.16)` | `rgb(201 162 39 / 0.16)` |
| `--ag-gold-line` | `rgb(203 164 90 / 0.55)` | `rgb(201 162 39 / 0.55)` |
| `--ag-invert-surface-raised` | `#141418` | `#222535` |
| `--ag-invert-gold-ink` | `#cba45a` | `#c9a227` |
| `--ag-shadow-gold` | `…rgb(203 164 90 / 0.8)` | `…rgb(201 162 39 / 0.8)` |
| `--ag-shadow-feature` | `…rgb(203 164 90 / 0.55)` | `…rgb(201 162 39 / 0.55)` |

Dark `--ag-ink` (`#f2f1ec`) and everything derived from it are unchanged, as is `--ag-invert-surface: transparent`.

- [x] **Step 3: Run the token test**

Run: `npx vitest run app/globals.token.test.ts`
Expected: PASS. It parses `globals.css` and asserts both palettes declare the same token set. It is structural, so revaluing cannot break it — a failure means a token was dropped, not revalued.

- [x] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat: adopt the brand black and Golden Harvest Glow accord"
```

---

### Task 4: The slab label

**Files:**
- Modify: `components/slab/slab.tsx`
- Modify: `components/slab/fixtures.ts`
- Modify: `components/slab/slab.test.tsx`

**Interfaces:**
- Consumes: `<Wordmark />` from Task 1.
- Produces: `SlabData` gains `number: string` and `rarity?: string`.

- [x] **Step 1: Write the failing tests**

In `components/slab/slab.test.tsx`:

```tsx
test("renders the set number", () => {
  renderWithIntl(<Slab data={slabFixture} />);
  expect(screen.getByText(/#004\/102/)).toBeInTheDocument();
});

test("omits the rarity line when the card has no rarity", () => {
  const { rarity, ...withoutRarity } = slabFixture;
  renderWithIntl(<Slab data={withoutRarity} />);
  expect(screen.queryByText(/holo rare/i)).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run — expect failure**

Run: `npx vitest run components/slab/slab.test.tsx`
Expected: FAIL — `number` is not on `SlabData` and nothing renders it.

- [x] **Step 3: Extend the type and fixtures**

```ts
export type SlabData = {
  cert: string;
  category: string;
  name: string;
  year: string;
  set: string;
  /** `#004/102` — M3 collects this as "set number". */
  number: string;
  /**
   * On the physical label (deck p. 8) but NOT among M3's required per-card
   * fields, so it is optional until the client decides whether submission
   * collects it. The line is omitted rather than blank when absent.
   */
  rarity?: string;
  grade: string;
  label: string;
  image?: string;
};
```

- [x] **Step 4: Rebuild the label header**

Replace the header row in `components/slab/slab.tsx` with the deck's device (p. 7 at label scale): a hairline rule interrupted at centre by the mark.

```tsx
<div className="flex items-center gap-2.5 pb-[11px]">
  <span aria-hidden className="h-px flex-1 bg-hairline" />
  <Wordmark className="h-[11px]" />
  <span aria-hidden className="h-px flex-1 bg-hairline" />
</div>
```

The metadata block below gains the number and the conditional rarity line, both in mono at `text-meta`, uppercase.

- [x] **Step 5: Run — expect pass**

Run: `npx vitest run components/slab/slab.test.tsx`
Expected: PASS.

- [x] **Step 6: Full suite and build**

Run: `npm test && npm run build`

- [x] **Step 7: Commit**

```bash
git add components/slab/
git commit -m "feat: rebuild the slab label to the brand manual spec"
```

---

### Task 5: Gallery entry and documentation

**Files:**
- Modify: `app/[locale]/design/page.tsx`
- Modify: `CLAUDE.md`

- [x] **Step 1: Add the brand row to the gallery**

The gallery is exempt from the no-hardcoded-strings rule. Add a section rendering `<Wordmark />` on paper, on `surface-invert`, and `<GasShield />`, so all three contexts are visible on one page.

- [x] **Step 2: Update CLAUDE.md**

The Design direction section says brand identity and logo design are out of scope, and the design system section describes a typographic wordmark. Both are now false. Record: the brand manual is the source of truth, the mark is real, `--gold`/`--gold-ink` values changed, GAS PROTECT is a feature not a brand.

- [x] **Step 3: Verify the gallery renders**

Run: `npm run build`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add app/\[locale\]/design/ CLAUDE.md
git commit -m "docs: record the brand identity adoption"
```

---

## Self-review

**Spec coverage.** Colour → Task 3. Typography → Task 2. The logo → Task 1. The slab label → Task 4. The gas fill → Task 1 (component) + Task 5 (gallery); page placement is deferred because landing and How it works are unbuilt, which the spec states. Testing section → Tasks 1, 3, 4. Sequencing → task order matches the spec's three commits, split finer.

**Type consistency.** `Wordmark({ className })` keeps its Task 1 signature where Task 4 consumes it. `SlabData.number` is `string` in the type, fixtures and test. `ART_MARK_PATHS` / `ART_MARK_VIEWBOX` are named identically in Task 1 Steps 4, 5 and 6.

**Deviation from the spec, recorded.** The spec proposed extracting a full lockup SVG from deck p. 5. That page contains a transparency group that `pdftocairo` flattens to a black rectangle — nothing extractable. The lockup is instead composed from the mark plus the tagline in our own type, which is better anyway: it translates, it scales, and it lets the p. 26 / p. 27 tagline question be answered later with CSS rather than new artwork.
