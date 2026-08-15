# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design token layer, glass treatment, component primitives, and site shell that every M1–M7 page is assembled from, proven by an internal `/design` gallery.

**Architecture:** Semantic token indirection. Raw values live as `--ag-*` CSS custom properties in `:root` (light) and two mirrored dark blocks; `@theme inline` maps them onto Tailwind's namespaces so `bg-surface` compiles to `background-color: var(--ag-surface)` and re-resolves through the cascade when the theme flips. Components therefore carry almost no `dark:` variants — theming is a cascade concern. Behaviour for accordion/switch/select/toggle-group comes from Base UI (headless); every visual is ours, expressed with CVA variants.

**Tech Stack:** Next.js 16.3 (App Router), React 19.2, TypeScript strict, Tailwind CSS v4.3.3 (PostCSS, no config file), `@base-ui-components/react` 1.0.0-rc.0, CVA, clsx, tailwind-merge, next-intl 4.13, Vitest 4 + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`

## Global Constraints

- **Token prefix.** Every raw custom property is `--ag-*`. Tailwind's `@theme` namespaces (`--color-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--text-*`, `--container-*`) map *from* them. Without the prefix, `--radius-card: var(--radius-card)` is self-referential and silently resolves to nothing.
- **`--gold` is for fills, borders and decoration. `--gold-ink` is the only gold permitted as a text colour.** Measured: `#B0883A` on `#FAFAF8` is 3.13:1 and fails WCAG AA. Never write `text-gold`; write `text-gold-ink`. Task 16 adds a test that enforces this.
- **No hardcoded user-facing copy.** All strings go in `messages/en.json`. The `/design` gallery is the one exemption (Task 16 documents it), alongside the existing `app/global-error.tsx` exemption.
- **Import `Link`, `useRouter`, `redirect`, `usePathname` from `@/i18n/navigation`**, never from `next/link` / `next/navigation`.
- **`globals: false` in Vitest** — import `describe`/`test`/`expect` from `vitest` in every test file.
- **Component tests go through `renderWithIntl` from `@/test/i18n`**, never `render` from `@testing-library/react` directly.
- **Never assert user-facing copy as a literal.** Import `messages/en.json` and assert against `messages.nav.faq`.
- **Tests are colocated** — `foo.test.tsx` sits beside `foo.tsx`.
- **A test needing Node instead of jsdom** puts `// @vitest-environment node` on line 1.
- **CI runs build before typecheck.** Next 16 generates route types into `.next/types/` during the build, so `npx tsc --noEmit` on a clean checkout fails without a prior `npm run build`. Don't reorder.
- **Client components** are only those that need state or effects: `SegmentedControl`, `Switch`, `Accordion`, `ThemeToggle`. Everything else stays a Server Component.
- Branch: `feat/design-system-foundation`, already created off `main`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `lib/cn.ts` | `cn()` — clsx + tailwind-merge |
| `components/ui/container.tsx` | max-width + gutter wrapper |
| `components/ui/section.tsx` | vertical rhythm, optional inverted surface |
| `components/ui/eyebrow.tsx` | gold-dot mono kicker above headings |
| `components/ui/kicker.tsx` | muted mono label |
| `components/ui/button.tsx` | `Button` + `buttonVariants` |
| `components/ui/card.tsx` | solid / glass panel |
| `components/ui/chip.tsx` | pill tag |
| `components/ui/stat.tsx` | `Stat` + `StatStrip` |
| `components/ui/segmented-control.tsx` | client — Base UI ToggleGroup |
| `components/ui/field.tsx` | `Field`, `FieldInput`, `FieldSelect` |
| `components/ui/switch.tsx` | client — Base UI Switch |
| `components/ui/accordion.tsx` | client — Base UI Accordion |
| `components/slab/grade-badge.tsx` | grade numeral + label box |
| `components/slab/slab.tsx` | the branded card slab |
| `components/slab/fixtures.ts` | gallery-only sample slabs |
| `components/layout/ambient-glow.tsx` | three fixed radial blobs |
| `components/layout/theme-script.tsx` | pre-paint `data-theme` stamp |
| `components/layout/theme-toggle.tsx` | client — light / dark / system |
| `components/layout/site-header.tsx` | sticky glass nav |
| `components/layout/site-footer.tsx` | inverted footer |
| `app/[locale]/design/page.tsx` | the gallery |
| `app/[locale]/design/_sections/*.tsx` | gallery sections |

**Modified:** `app/globals.css` (replaced wholesale), `app/[locale]/layout.tsx`, `app/[locale]/page.tsx`, `messages/en.json`, `package.json`, `CLAUDE.md`.

---

### Task 1: Dependencies and the `cn()` helper

**Files:**
- Modify: `package.json`
- Create: `lib/cn.ts`
- Test: `lib/cn.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/cn`. Every later task imports it.

- [ ] **Step 1: Install the dependencies**

```bash
npm install @base-ui-components/react@^1.0.0-rc.0 class-variance-authority@^0.7.1 clsx@^2 tailwind-merge@^3.6
```

These are runtime `dependencies`, not devDependencies — they ship in the bundle.

- [ ] **Step 2: Write the failing test**

Create `lib/cn.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  test("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  test("lets a later Tailwind class win over an earlier conflicting one", () => {
    // This is the whole reason tailwind-merge exists: a component's own
    // padding must lose to a `className` passed by its caller.
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  test("keeps non-conflicting Tailwind classes", () => {
    expect(cn("px-4", "py-8")).toBe("px-4 py-8");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run lib/cn.test.ts`
Expected: FAIL — `Failed to resolve import "./cn"`.

- [ ] **Step 4: Write the implementation**

Create `lib/cn.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Composes class names, with later Tailwind utilities beating earlier
 * conflicting ones.
 *
 * Every component in this design system takes a `className` and merges it
 * LAST, so a caller can always override a default without `!important` and
 * without the outcome depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run lib/cn.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/cn.ts lib/cn.test.ts
git commit -m "feat: add design system dependencies and cn() helper"
```

---

### Task 2: Token layer

**Files:**
- Modify: `app/globals.css` (replace the entire file)
- Test: `app/globals.token.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities used by every later task — `bg-surface`, `bg-surface-sunken`, `bg-surface-raised`, `text-ink`, `text-ink-strong`, `text-muted`, `text-gold-ink`, `text-on-gold`, `border-hairline`, `border-hairline-faint`, `border-gold-line`, `bg-gold`, `bg-gold-soft`, `rounded-control`, `rounded-card`, `rounded-panel`, `rounded-group`, `shadow-card`, `shadow-gold`, `shadow-feature`, `font-serif`, `font-sans`, `font-mono`, `text-display`, `text-h2`, `text-h3`, `text-lead`, `text-eyebrow`, `text-kicker`, `text-label`, `text-meta`, `max-w-page`; and the custom utilities `glass`, `glass-strong`, `gold-fill`, `surface-invert`, `focus-ring`, `section-y`.

- [ ] **Step 1: Write the failing test**

Create `app/globals.token.test.ts`. Line 1 must be the environment docblock — this test reads a file and never touches the DOM.

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Returns the body of the first block whose selector line matches `head`. */
function block(head: string): string {
  const start = css.indexOf(head);
  if (start === -1) throw new Error(`No block found for: ${head}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after: ${head}`);
}

/** Maps every `--ag-*` declaration in a block to its value. */
function tokens(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of body.matchAll(/(--ag-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(m[1], m[2].trim());
  }
  return found;
}

const light = tokens(block("\n:root {"));
const darkMedia = tokens(block(':root:not([data-theme="light"]) {'));
const darkAttr = tokens(block('\n[data-theme="dark"] {'));

describe("design tokens", () => {
  test("the light palette is not empty", () => {
    expect(light.size).toBeGreaterThan(20);
  });

  test("every light token has a dark value", () => {
    const missing = [...light.keys()].filter((k) => !darkAttr.has(k));
    expect(missing).toEqual([]);
  });

  test("every dark token has a light value", () => {
    const extra = [...darkAttr.keys()].filter((k) => !light.has(k));
    expect(extra).toEqual([]);
  });

  test("the two dark blocks are identical", () => {
    // The prefers-color-scheme block and the [data-theme=dark] block are
    // hand-duplicated because CSS cannot share a declaration list across a
    // media boundary. This is the test that keeps them from drifting.
    expect(Object.fromEntries(darkMedia)).toEqual(Object.fromEntries(darkAttr));
  });

  test("gold-ink differs from gold in the light theme", () => {
    // #B0883A on #FAFAF8 is 3.13:1 and fails WCAG AA for text. If these ever
    // collapse back to one value, that failure is silently reintroduced.
    expect(light.get("--ag-gold-ink")).not.toBe(light.get("--ag-gold"));
  });

  test("surface-invert redefines gold-ink", () => {
    // Inside an inverted region the relationship flips: the darkened
    // #836428 measures 3.51:1 on ink and fails, while #B0883A measures 5.91:1.
    expect(light.has("--ag-invert-gold-ink")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run app/globals.token.test.ts`
Expected: FAIL — `No block found for: :root:not([data-theme="light"]) {`.

- [ ] **Step 3: Replace `app/globals.css`**

Delete the existing contents entirely (the Geist placeholder) and write:

```css
@import "tailwindcss";

/* ---------------------------------------------------------------------------
 * Dark variant — tri-state.
 *
 * An explicit choice on <html data-theme> wins in both directions; with no
 * choice recorded, the system preference decides. The `:not([data-theme=light])`
 * guard is what lets someone pick light while their OS is dark.
 *
 * Note that components need this variant only rarely: `bg-surface` resolves
 * through `var(--ag-surface)`, which the palette blocks below already swap.
 * Theming is a cascade concern here, not a variant concern.
 * ------------------------------------------------------------------------- */
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]) *) {
      @slot;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Palette — light (default).
 *
 * Tokens are named by ROLE, never by value: `paper` and `ink` swap places
 * between themes, so those names could not survive as literals.
 *
 * Every raw token is `--ag-*`. The `@theme inline` block further down maps
 * them onto Tailwind's namespaces; without the prefix, a mapping like
 * `--radius-card: var(--radius-card)` would be self-referential.
 * ------------------------------------------------------------------------- */
:root {
  color-scheme: light;

  --ag-surface: #fafaf8;
  --ag-surface-sunken: #f2f1ec;
  --ag-surface-raised: #ffffff;

  --ag-ink: #0e0e0f;
  --ag-ink-strong: #1a1a1c;
  --ag-muted: rgb(14 14 15 / 0.6);

  --ag-hairline: rgb(14 14 15 / 0.1);
  --ag-hairline-faint: rgb(14 14 15 / 0.06);

  /* `--ag-gold` is fills, borders, decoration. `--ag-gold-ink` is the ONLY
     gold allowed as a text colour: #B0883A on #FAFAF8 measures 3.13:1 and
     fails WCAG AA, while #836428 measures 5.26:1. */
  --ag-gold: #b0883a;
  --ag-gold-ink: #836428;
  --ag-gold-bright: #c9a24b;
  --ag-gold-soft: rgb(176 136 58 / 0.12);
  --ag-gold-line: rgb(176 136 58 / 0.4);
  --ag-on-gold: #160f02;

  /* The gold button is a flat fill on paper and a vertical gradient on glass,
     so this token holds an <image>, not a <color>. */
  --ag-gold-fill: var(--ag-gold);

  /* Inverted regions (dark bands inside a light page, and the order summary).
     Gold flips role here: on ink it is `--ag-gold` that passes AA at 5.91:1,
     while the darkened `--ag-gold-ink` drops to 3.51:1 and fails. */
  --ag-invert-surface: #0e0e0f;
  --ag-invert-surface-raised: #1a1a1c;
  --ag-invert-ink: #fafaf8;
  --ag-invert-muted: rgb(250 250 248 / 0.58);
  --ag-invert-hairline: rgb(255 255 255 / 0.1);
  --ag-invert-gold-ink: #b0883a;

  --ag-glow-cool: #6c7ca8;
  --ag-glow-opacity: 0.18;

  --ag-glass-bg: rgb(255 255 255 / 0.7);
  --ag-glass-bg-strong: rgb(255 255 255 / 0.85);
  --ag-glass-border: rgb(14 14 15 / 0.08);
  --ag-glass-highlight: rgb(255 255 255 / 0.6);
  --ag-glass-blur: 14px;
  --ag-glass-saturate: 140%;

  /* Radii are themed: glass surfaces read softer, so the design grows their
     corners (slab 13 -> 18, panel 16 -> 22). */
  --ag-radius-control: 9px;
  --ag-radius-group: 11px;
  --ag-radius-card: 13px;
  --ag-radius-panel: 16px;

  --ag-shadow-card: 0 1px 2px rgb(0 0 0 / 0.04), 0 26px 50px -30px rgb(0 0 0 / 0.4);
  --ag-shadow-gold: inset 0 1px 0 rgb(255 255 255 / 0.25),
    0 10px 24px -14px rgb(176 136 58 / 0.9);
  --ag-shadow-feature: 0 0 0 1px var(--ag-gold-line),
    0 30px 60px -36px rgb(176 136 58 / 0.55);

  --ag-container: 1180px;
  --ag-gutter: 2rem;
}

/* ---------------------------------------------------------------------------
 * Palette — dark.
 *
 * Declared TWICE on purpose. CSS cannot share a declaration list across a
 * media-query boundary, and giving a token its only definition inside a media
 * block means it is undefined when the attribute wins instead. The token test
 * in `app/globals.token.test.ts` asserts the two copies stay identical — edit
 * both or the test fails.
 * ------------------------------------------------------------------------- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;

    --ag-surface: #08080b;
    --ag-surface-sunken: #0c0c10;
    --ag-surface-raised: #141418;

    --ag-ink: #f2f1ec;
    --ag-ink-strong: #e8e7e1;
    --ag-muted: rgb(242 241 236 / 0.62);

    --ag-hairline: rgb(255 255 255 / 0.14);
    --ag-hairline-faint: rgb(255 255 255 / 0.08);

    --ag-gold: #cba45a;
    --ag-gold-ink: #cba45a;
    --ag-gold-bright: #ddbc7a;
    --ag-gold-soft: rgb(203 164 90 / 0.16);
    --ag-gold-line: rgb(203 164 90 / 0.55);
    --ag-on-gold: #160f02;

    --ag-gold-fill: linear-gradient(180deg, var(--ag-gold-bright), var(--ag-gold));

    --ag-invert-surface: transparent;
    --ag-invert-surface-raised: #141418;
    --ag-invert-ink: #f2f1ec;
    --ag-invert-muted: rgb(242 241 236 / 0.62);
    --ag-invert-hairline: rgb(255 255 255 / 0.14);
    --ag-invert-gold-ink: #cba45a;

    --ag-glow-cool: #6c7ca8;
    --ag-glow-opacity: 0.55;

    --ag-glass-bg: rgb(255 255 255 / 0.065);
    --ag-glass-bg-strong: rgb(255 255 255 / 0.1);
    --ag-glass-border: rgb(255 255 255 / 0.18);
    --ag-glass-highlight: rgb(255 255 255 / 0.14);
    --ag-glass-blur: 24px;
    --ag-glass-saturate: 160%;

    --ag-radius-control: 10px;
    --ag-radius-group: 13px;
    --ag-radius-card: 18px;
    --ag-radius-panel: 22px;

    --ag-shadow-card: inset 0 1px 0 rgb(255 255 255 / 0.14),
      0 30px 64px -32px rgb(0 0 0 / 0.75);
    --ag-shadow-gold: inset 0 1px 0 rgb(255 255 255 / 0.4),
      0 14px 34px -14px rgb(203 164 90 / 0.8);
    --ag-shadow-feature: 0 0 0 1px var(--ag-gold-line),
      inset 0 1px 0 rgb(255 255 255 / 0.18),
      0 44px 90px -44px rgb(203 164 90 / 0.55);

    --ag-container: 1180px;
    --ag-gutter: 2rem;
  }
}

[data-theme="dark"] {
  color-scheme: dark;

  --ag-surface: #08080b;
  --ag-surface-sunken: #0c0c10;
  --ag-surface-raised: #141418;

  --ag-ink: #f2f1ec;
  --ag-ink-strong: #e8e7e1;
  --ag-muted: rgb(242 241 236 / 0.62);

  --ag-hairline: rgb(255 255 255 / 0.14);
  --ag-hairline-faint: rgb(255 255 255 / 0.08);

  --ag-gold: #cba45a;
  --ag-gold-ink: #cba45a;
  --ag-gold-bright: #ddbc7a;
  --ag-gold-soft: rgb(203 164 90 / 0.16);
  --ag-gold-line: rgb(203 164 90 / 0.55);
  --ag-on-gold: #160f02;

  --ag-gold-fill: linear-gradient(180deg, var(--ag-gold-bright), var(--ag-gold));

  --ag-invert-surface: transparent;
  --ag-invert-surface-raised: #141418;
  --ag-invert-ink: #f2f1ec;
  --ag-invert-muted: rgb(242 241 236 / 0.62);
  --ag-invert-hairline: rgb(255 255 255 / 0.14);
  --ag-invert-gold-ink: #cba45a;

  --ag-glow-cool: #6c7ca8;
  --ag-glow-opacity: 0.55;

  --ag-glass-bg: rgb(255 255 255 / 0.065);
  --ag-glass-bg-strong: rgb(255 255 255 / 0.1);
  --ag-glass-border: rgb(255 255 255 / 0.18);
  --ag-glass-highlight: rgb(255 255 255 / 0.14);
  --ag-glass-blur: 24px;
  --ag-glass-saturate: 160%;

  --ag-radius-control: 10px;
  --ag-radius-group: 13px;
  --ag-radius-card: 18px;
  --ag-radius-panel: 22px;

  --ag-shadow-card: inset 0 1px 0 rgb(255 255 255 / 0.14),
    0 30px 64px -32px rgb(0 0 0 / 0.75);
  --ag-shadow-gold: inset 0 1px 0 rgb(255 255 255 / 0.4),
    0 14px 34px -14px rgb(203 164 90 / 0.8);
  --ag-shadow-feature: 0 0 0 1px var(--ag-gold-line),
    inset 0 1px 0 rgb(255 255 255 / 0.18),
    0 44px 90px -44px rgb(203 164 90 / 0.55);

  --ag-container: 1180px;
  --ag-gutter: 2rem;
}

/* ---------------------------------------------------------------------------
 * Tailwind theme mapping.
 *
 * `inline` means Tailwind emits `var(--ag-surface)` into the utility rather
 * than the resolved value, which is exactly what makes the cascade do the
 * theming.
 * ------------------------------------------------------------------------- */
@theme inline {
  --color-surface: var(--ag-surface);
  --color-surface-sunken: var(--ag-surface-sunken);
  --color-surface-raised: var(--ag-surface-raised);
  --color-ink: var(--ag-ink);
  --color-ink-strong: var(--ag-ink-strong);
  --color-muted: var(--ag-muted);
  --color-hairline: var(--ag-hairline);
  --color-hairline-faint: var(--ag-hairline-faint);
  --color-gold: var(--ag-gold);
  --color-gold-ink: var(--ag-gold-ink);
  --color-gold-bright: var(--ag-gold-bright);
  --color-gold-soft: var(--ag-gold-soft);
  --color-gold-line: var(--ag-gold-line);
  --color-on-gold: var(--ag-on-gold);
  --color-glow-cool: var(--ag-glow-cool);

  --radius-control: var(--ag-radius-control);
  --radius-group: var(--ag-radius-group);
  --radius-card: var(--ag-radius-card);
  --radius-panel: var(--ag-radius-panel);

  --shadow-card: var(--ag-shadow-card);
  --shadow-gold: var(--ag-shadow-gold);
  --shadow-feature: var(--ag-shadow-feature);

  --font-sans: var(--ag-font-sans), system-ui, sans-serif;
  --font-serif: var(--ag-font-serif), Georgia, serif;
  --font-mono: var(--ag-font-mono), ui-monospace, monospace;

  /* The upper clamp bound of each display size is the design's literal value,
     so desktop is a faithful port. The design is authored at a fixed 1180px
     and has no responsive behaviour; everything below that bound is new. */
  --text-display: clamp(2.5rem, 1.6rem + 3.8vw, 4.125rem);
  --text-display--line-height: 1.03;
  --text-display--letter-spacing: -0.015em;
  --text-h2: clamp(1.875rem, 1.4rem + 2vw, 2.625rem);
  --text-h2--line-height: 1.07;
  --text-h2--letter-spacing: -0.01em;
  --text-h3: 1.375rem;
  --text-h3--line-height: 1.2;
  --text-lead: clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem);
  --text-lead--line-height: 1.6;
  --text-eyebrow: 0.75rem;
  --text-eyebrow--letter-spacing: 0.22em;
  --text-kicker: 0.6875rem;
  --text-kicker--letter-spacing: 0.2em;
  --text-label: 0.6875rem;
  --text-label--letter-spacing: 0.12em;
  --text-meta: 0.625rem;
  --text-meta--letter-spacing: 0.04em;

  --container-page: var(--ag-container);
}

/* ---------------------------------------------------------------------------
 * Custom utilities.
 * ------------------------------------------------------------------------- */

/** Frosted panel. Subtle white on paper, full liquid glass on black. */
@utility glass {
  background: var(--ag-glass-bg);
  backdrop-filter: blur(var(--ag-glass-blur)) saturate(var(--ag-glass-saturate));
  -webkit-backdrop-filter: blur(var(--ag-glass-blur)) saturate(var(--ag-glass-saturate));
  border: 1px solid var(--ag-glass-border);
  box-shadow: inset 0 1px 0 var(--ag-glass-highlight);
}

/** Elevated frosted panel — same recipe plus the card drop shadow. */
@utility glass-strong {
  background: var(--ag-glass-bg-strong);
  backdrop-filter: blur(var(--ag-glass-blur)) saturate(var(--ag-glass-saturate));
  -webkit-backdrop-filter: blur(var(--ag-glass-blur)) saturate(var(--ag-glass-saturate));
  border: 1px solid var(--ag-glass-border);
  box-shadow: inset 0 1px 0 var(--ag-glass-highlight), var(--ag-shadow-card);
}

/** The gold button fill — flat in light, gradient in dark. */
@utility gold-fill {
  background: var(--ag-gold-fill);
}

/**
 * Locally redefines the role tokens so nested components theme correctly with
 * no extra classes. In the dark theme this is close to a no-op, which is what
 * the design shows: its dark bands are simply transparent.
 */
@utility surface-invert {
  --ag-surface: var(--ag-invert-surface);
  --ag-surface-raised: var(--ag-invert-surface-raised);
  --ag-ink: var(--ag-invert-ink);
  --ag-muted: var(--ag-invert-muted);
  --ag-hairline: var(--ag-invert-hairline);
  --ag-gold-ink: var(--ag-invert-gold-ink);
  background-color: var(--ag-surface);
  color: var(--ag-ink);
}

/**
 * The focus indicator. `outline` rather than `box-shadow` so it is never
 * clipped by an ancestor's `overflow: hidden`. Gold measures 3.13:1 against
 * the light surface, which clears the 3:1 floor WCAG 1.4.11 sets for
 * non-text contrast.
 */
@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--ag-gold);
    outline-offset: 2px;
  }
}

/** Section rhythm — the design's 104px, reduced on small viewports. */
@utility section-y {
  padding-block: 3.5rem;
  @media (width >= 48rem) {
    padding-block: 6.5rem;
  }
}

/* ---------------------------------------------------------------------------
 * Base.
 * ------------------------------------------------------------------------- */
@layer base {
  body {
    background-color: var(--ag-surface);
    color: var(--ag-ink);
    font-family: var(--font-sans);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  ::selection {
    background: var(--ag-gold-soft);
  }
}

/**
 * Transparency fallback. Two triggers: a user who has asked for less
 * transparency, and a browser without `backdrop-filter` at all. Both land on
 * an opaque raised surface — which is why `--ag-surface-raised` is opaque in
 * both themes and translucency lives only in the `--ag-glass-*` tokens.
 */
@media (prefers-reduced-transparency: reduce), (not (backdrop-filter: blur(1px))) {
  .glass,
  .glass-strong {
    background: var(--ag-surface-raised);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run app/globals.token.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the stylesheet actually compiles**

The token test only reads text. This step proves Tailwind accepts it.

Run: `npm run build`
Expected: succeeds. The existing `app/[locale]/page.tsx` still uses `bg-foreground`/`text-background`, which no longer exist — those classes simply produce no CSS rather than erroring. Task 3 replaces them.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/globals.token.test.ts
git commit -m "feat: add design system token layer and glass utilities"
```

---

### Task 3: Fonts, theme script, and layout wiring

**Files:**
- Create: `components/layout/theme-script.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `app/globals.css` from Task 2.
- Produces: `<ThemeScript />` (no props) from `@/components/layout/theme-script`; `--ag-font-sans`, `--ag-font-serif`, `--ag-font-mono` defined on `<html>`, which is what makes `font-sans` / `font-serif` / `font-mono` resolve.

- [ ] **Step 1: Write the theme script**

Create `components/layout/theme-script.tsx`:

```tsx
/**
 * Stamps `data-theme` on <html> before first paint so a user who chose dark
 * does not get a flash of the light theme on every navigation.
 *
 * It deliberately stamps NOTHING when no choice has been recorded. That is
 * what leaves the `prefers-color-scheme` block in globals.css authoritative,
 * and it is why a visitor with JavaScript disabled still gets the theme their
 * system asked for.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) {}
`.trim();

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
```

- [ ] **Step 2: Rewrite the layout**

Replace `app/[locale]/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { ThemeScript } from "@/components/layout/theme-script";
import { routing } from "@/i18n/routing";
import "../globals.css";

// All three faces ship a variable version, so `weight` is omitted on purpose:
// that loads the full axis range in one file instead of one file per weight.
const serif = Newsreader({
  variable: "--ag-font-serif",
  subsets: ["latin"],
  display: "swap",
});

const sans = Hanken_Grotesk({
  variable: "--ag-font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--ag-font-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Prerender every locale at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  // The `[locale]` segment matches anything, so reject unknown codes here.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    // `suppressHydrationWarning` because ThemeScript mutates the `data-theme`
    // attribute before React hydrates, which React would otherwise report as
    // a server/client mismatch.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {/* Without props, the provider inherits locale, messages, time zone
            and formats from the server config in `i18n/request.ts`. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update the placeholder page to the new tokens**

`app/[locale]/page.tsx` still references `bg-foreground`, `text-background`, and `zinc-*`, none of which exist now. Replace its `className` values only — the structure, the `useTranslations` call, and every `t(...)` key stay exactly as they are:

```tsx
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function Home() {
  // `useTranslations` is sync and works in Server Components — no `await`,
  // and the messages never reach the client bundle from here.
  const t = useTranslations("home");

  return (
    <div className="flex flex-1 flex-col items-center bg-surface">
      <main className="flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-8 py-32 sm:px-16">
        <div className="flex flex-col gap-6">
          <h1 className="max-w-xl font-serif text-display text-ink">
            {t("title")}
          </h1>
          <p className="max-w-md text-lead text-muted">{t("subtitle")}</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/submit"
            className="focus-ring gold-fill flex h-12 items-center justify-center rounded-control px-6 text-[15px] font-semibold text-on-gold shadow-gold"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href="/how-it-works"
            className="focus-ring flex h-12 items-center justify-center rounded-control border border-hairline bg-surface-raised px-6 text-[15px] font-semibold text-ink"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run the existing page test**

The existing `app/[locale]/page.test.tsx` asserts against `messages.home.*`, not class names, so it must still pass unchanged. If it fails, a message key was changed by mistake.

Run: `npx vitest run "app/[locale]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Verify the build and fonts**

Run: `npm run build`
Expected: succeeds; both locales prerender as static HTML.

Then run `npm run dev`, open `http://localhost:3000`, and confirm in DevTools that `<html>` carries three `__variable_*` classes and that `getComputedStyle(document.body).fontFamily` reports Hanken Grotesk. Headings must render in Newsreader.

- [ ] **Step 6: Commit**

```bash
git add components/layout/theme-script.tsx "app/[locale]/layout.tsx" "app/[locale]/page.tsx"
git commit -m "feat: wire design system fonts and pre-paint theme script"
```

---

### Task 4: Layout primitives — Container, Section, Eyebrow, Kicker

**Files:**
- Create: `components/ui/container.tsx`, `components/ui/section.tsx`, `components/ui/eyebrow.tsx`, `components/ui/kicker.tsx`
- Test: `components/ui/section.test.tsx`, `components/ui/eyebrow.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/cn`.
- Produces:
  - `Container({ className, children }: { className?: string; children: ReactNode })`
  - `Section({ invert?: boolean; className?: string; children: ReactNode; id?: string })`
  - `Eyebrow({ className?: string; children: ReactNode })`
  - `Kicker({ className?: string; children: ReactNode })`

- [ ] **Step 1: Write the failing tests**

Create `components/ui/eyebrow.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Eyebrow } from "./eyebrow";

describe("Eyebrow", () => {
  test("renders its children", () => {
    renderWithIntl(<Eyebrow>Recently graded</Eyebrow>);
    expect(screen.getByText("Recently graded")).toBeInTheDocument();
  });

  test("uses the accessible gold, never the decorative one", () => {
    renderWithIntl(<Eyebrow>Pricing</Eyebrow>);
    const el = screen.getByText("Pricing");
    expect(el.className).toContain("text-gold-ink");
    expect(el.className).not.toMatch(/\btext-gold\b/);
  });

  test("merges a caller className", () => {
    renderWithIntl(<Eyebrow className="mt-8">FAQ</Eyebrow>);
    expect(screen.getByText("FAQ").className).toContain("mt-8");
  });
});
```

Create `components/ui/section.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Section } from "./section";

describe("Section", () => {
  test("renders a <section> with its children", () => {
    renderWithIntl(<Section>body</Section>);
    expect(screen.getByText("body").tagName).toBe("SECTION");
  });

  test("applies the inverted surface only when asked", () => {
    const { rerender } = renderWithIntl(<Section>plain</Section>);
    expect(screen.getByText("plain").className).not.toContain("surface-invert");

    rerender(<Section invert>flipped</Section>);
    expect(screen.getByText("flipped").className).toContain("surface-invert");
  });

  test("forwards an id so in-page anchors work", () => {
    renderWithIntl(<Section id="pricing">x</Section>);
    expect(screen.getByText("x")).toHaveAttribute("id", "pricing");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run components/ui/eyebrow.test.tsx components/ui/section.test.tsx`
Expected: FAIL — both modules unresolved.

- [ ] **Step 3: Write the four components**

`components/ui/container.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** The 1180px measure the whole design is laid out against. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-page px-[var(--ag-gutter)]", className)}
    >
      {children}
    </div>
  );
}
```

`components/ui/section.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A page band. `invert` swaps the role tokens locally via `surface-invert`,
 * so everything nested inside themes correctly without a single `dark:` class.
 */
export function Section({
  invert = false,
  id,
  className,
  children,
}: {
  invert?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("section-y", invert && "surface-invert", className)}>
      {children}
    </section>
  );
}
```

`components/ui/eyebrow.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The gold-dot label above a heading. Uses `text-gold-ink`, never `text-gold`:
 * at 12px the decorative gold measures 3.13:1 on paper and fails WCAG AA.
 */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center font-mono text-eyebrow uppercase text-gold-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className="mr-2 inline-block size-1.5 shrink-0 rounded-[1px] bg-gold"
      />
      {children}
    </div>
  );
}
```

`components/ui/kicker.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A muted mono label — smaller and quieter than Eyebrow, and not gold. */
export function Kicker({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("font-mono text-kicker uppercase text-muted", className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run components/ui/eyebrow.test.tsx components/ui/section.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/container.tsx components/ui/section.tsx components/ui/eyebrow.tsx components/ui/kicker.tsx components/ui/eyebrow.test.tsx components/ui/section.test.tsx
git commit -m "feat: add Container, Section, Eyebrow and Kicker primitives"
```

---

### Task 5: Button

**Files:**
- Create: `components/ui/button.tsx`
- Test: `components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/cn`.
- Produces:
  - `buttonVariants({ variant?: "gold" | "ink" | "ghost"; size?: "md" | "sm" }): string` — apply to a `Link` when you need an anchor.
  - `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "gold" | "ink" | "ghost"; size?: "md" | "sm" })`

There is deliberately no `asChild` / polymorphism machinery. A link that looks like a button is `<Link className={buttonVariants({ variant: "gold" })}>`, which keeps `Button` a plain `<button>` and avoids a whole class of ref and typing problems.

- [ ] **Step 1: Write the failing test**

Create `components/ui/button.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  test("renders a native button element", () => {
    renderWithIntl(<Button>Submit a card</Button>);
    expect(screen.getByRole("button", { name: "Submit a card" })).toBeInTheDocument();
  });

  test("defaults to the gold variant at medium size", () => {
    renderWithIntl(<Button>Go</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("gold-fill");
    expect(el.className).toContain("h-[50px]");
  });

  test("renders the ghost variant without the gold fill", () => {
    renderWithIntl(<Button variant="ghost">View pricing</Button>);
    expect(screen.getByRole("button").className).not.toContain("gold-fill");
  });

  test("renders the small size", () => {
    renderWithIntl(<Button size="sm">Sign in</Button>);
    expect(screen.getByRole("button").className).toContain("h-[42px]");
  });

  test("calls onClick", async () => {
    const onClick = vi.fn();
    const { user } = renderWithIntl(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    const { user } = renderWithIntl(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("merges a caller className last", () => {
    renderWithIntl(<Button className="w-full">Go</Button>);
    expect(screen.getByRole("button").className).toContain("w-full");
  });

  test("buttonVariants produces classes for a link", () => {
    expect(buttonVariants({ variant: "gold" })).toContain("gold-fill");
  });
});
```

This test uses `user` from the render result. `renderWithIntl` does not currently return one — the next step adds it.

- [ ] **Step 2: Add a userEvent instance to `renderWithIntl`**

Modify `test/i18n.tsx`. Add the import and extend the return value; leave the existing doc comment and the `Wrapper` intact.

Add to the imports:

```tsx
import userEvent, { type UserEvent } from "@testing-library/user-event";
```

Change the return type and the final statement:

```tsx
export function renderWithIntl(
  ui: ReactElement,
  { locale = routing.defaultLocale, ...options }: RenderWithIntlOptions = {},
): RenderResult & { user: UserEvent } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }

  // A userEvent instance per render. Interaction tests need one, and setting
  // it up here keeps every test from repeating the boilerplate — and from
  // reaching for `fireEvent`, which skips the pointer and focus events real
  // browsers dispatch.
  return { user: userEvent.setup(), ...render(ui, { wrapper: Wrapper, ...options }) };
}
```

Install the package:

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: FAIL — `Failed to resolve import "./button"`.

- [ ] **Step 4: Write the implementation**

Create `components/ui/button.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Exported so a locale-aware `Link` can look like a button without `Button`
 * needing to be polymorphic:
 *
 *   <Link href="/submit" className={buttonVariants({ variant: "gold" })}>
 */
export const buttonVariants = cva(
  "focus-ring inline-flex items-center justify-center gap-[9px] whitespace-nowrap rounded-control border border-transparent font-sans font-semibold transition-[background,border-color,filter] duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // `gold-fill` carries the flat/gradient split between themes.
        gold: "gold-fill border-black/10 text-on-gold shadow-gold hover:brightness-[1.06]",
        ink: "bg-ink text-surface hover:bg-ink-strong",
        ghost:
          "glass text-ink hover:border-gold-line",
      },
      size: {
        // The design's exact heights. `min-w` and the touch-target padding
        // below keep the small size usable on a coarse pointer, where 42px is
        // under the 44px floor.
        md: "h-[50px] px-6 text-[15px]",
        sm: "h-[42px] px-[18px] text-sm",
      },
    },
    defaultVariants: { variant: "gold", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        buttonVariants({ variant, size }),
        // Expands the hit area to 44px on touch without changing the visual
        // height, satisfying WCAG 2.5.8 for the small size.
        "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all green — the `test/i18n.tsx` change must not have broken the existing page test.

- [ ] **Step 7: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx test/i18n.tsx package.json package-lock.json
git commit -m "feat: add Button with CVA variants"
```

---

### Task 6: Card and Chip

**Files:**
- Create: `components/ui/card.tsx`, `components/ui/chip.tsx`
- Test: `components/ui/card.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces:
  - `Card({ variant?: "solid" | "glass"; className?: string; children: ReactNode })`
  - `Chip({ className?: string; children: ReactNode })`

- [ ] **Step 1: Write the failing test**

Create `components/ui/card.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Card } from "./card";

describe("Card", () => {
  test("defaults to the solid surface", () => {
    renderWithIntl(<Card>inside</Card>);
    const el = screen.getByText("inside");
    expect(el.className).toContain("bg-surface-raised");
    expect(el.className).not.toContain("glass");
  });

  test("renders the glass variant without a solid background", () => {
    renderWithIntl(<Card variant="glass">inside</Card>);
    const el = screen.getByText("inside");
    expect(el.className).toContain("glass");
    expect(el.className).not.toContain("bg-surface-raised");
  });

  test("merges a caller className", () => {
    renderWithIntl(<Card className="p-10">inside</Card>);
    expect(screen.getByText("inside").className).toContain("p-10");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/card.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementations**

`components/ui/card.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-card", {
  variants: {
    variant: {
      solid: "border border-hairline bg-surface-raised shadow-card",
      // `glass` already carries its own background, border and inset
      // highlight, so it must not be combined with bg-surface-raised.
      glass: "glass",
    },
  },
  defaultVariants: { variant: "solid" },
});

export function Card({
  variant,
  className,
  children,
}: VariantProps<typeof cardVariants> & {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(cardVariants({ variant }), className)}>{children}</div>;
}
```

`components/ui/chip.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A pill tag — order numbers, category markers. */
export function Chip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-2 rounded-full px-3.5 py-[7px] font-mono text-[11px] tracking-[0.1em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/card.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/card.tsx components/ui/chip.tsx components/ui/card.test.tsx
git commit -m "feat: add Card and Chip primitives"
```

---

### Task 7: GradeBadge, Slab, and gallery fixtures

**Files:**
- Create: `components/slab/grade-badge.tsx`, `components/slab/slab.tsx`, `components/slab/fixtures.ts`
- Test: `components/slab/slab.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces:
  - `GradeBadge({ grade: string; label: string; size?: "md" | "lg"; className?: string })`
  - `type SlabData = { cert: string; category: string; name: string; year: string; set: string; grade: string; label: string; image?: string }`
  - `Slab({ data, className }: { data: SlabData; className?: string })`
  - `SAMPLE_SLABS: SlabData[]` from `@/components/slab/fixtures`

`GradeBadge` is split out because M4's Pop Report needs it standalone, away from the slab frame.

- [ ] **Step 1: Write the failing test**

Create `components/slab/slab.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { type SlabData, Slab } from "./slab";

const data: SlabData = {
  cert: "ART-08831204",
  category: "TCG",
  name: "Charizard",
  year: "1999",
  set: "Base · Holo",
  grade: "10",
  label: "GEM MINT",
};

describe("Slab", () => {
  test("renders the certificate number", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("ART-08831204")).toBeInTheDocument();
  });

  test("renders the card name and its year and set", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("Charizard")).toBeInTheDocument();
    expect(screen.getByText(/1999/)).toBeInTheDocument();
    expect(screen.getByText(/Base · Holo/)).toBeInTheDocument();
  });

  test("renders the grade and its label", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("GEM MINT")).toBeInTheDocument();
  });

  test("falls back to the hatch window when there is no image", () => {
    renderWithIntl(<Slab data={data} />);
    // Real card images arrive with R2 in M3. Until then the window shows the
    // category label over the hatch pattern, and there is no <img> to find.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("TCG")).toBeInTheDocument();
  });

  test("renders an image when one is supplied", () => {
    renderWithIntl(<Slab data={{ ...data, image: "/cards/charizard.webp" }} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/cards/charizard.webp");
  });

  test("gives the image an accessible name built from the card", () => {
    renderWithIntl(<Slab data={{ ...data, image: "/cards/charizard.webp" }} />);
    expect(screen.getByRole("img", { name: /Charizard/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/slab/slab.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write GradeBadge**

`components/slab/grade-badge.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "shrink-0 rounded-[8px] border border-gold-line bg-gold-soft text-center",
  {
    variants: {
      size: {
        md: "px-[11px] py-[7px]",
        lg: "px-[15px] py-[10px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const numberSize = { md: "text-[30px]", lg: "text-[40px]" } as const;

/**
 * The grade numeral and its wording. Split out from `Slab` because the M4
 * Pop Report renders grade distributions without the slab frame.
 */
export function GradeBadge({
  grade,
  label,
  size = "md",
  className,
}: {
  grade: string;
  label: string;
  className?: string;
} & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ size }), className)}>
      <div
        className={cn(
          "font-serif font-semibold leading-[0.9] text-ink",
          numberSize[size ?? "md"],
        )}
      >
        {grade}
      </div>
      <div className="mt-1 font-mono text-[8px] font-medium tracking-[0.12em] text-gold-ink">
        {label}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write Slab**

`components/slab/slab.tsx`:

```tsx
import { cn } from "@/lib/cn";

import { GradeBadge } from "./grade-badge";

export type SlabData = {
  cert: string;
  category: string;
  name: string;
  year: string;
  set: string;
  grade: string;
  label: string;
  /** Absent until R2 uploads land in M3; the window falls back to the hatch. */
  image?: string;
};

/**
 * The signature object of the brand: a graded card sealed in its holder.
 *
 * Glass in both themes — a frosted white panel on paper, full liquid glass on
 * black — which is what `glass-strong` resolves to per theme.
 */
export function Slab({ data, className }: { data: SlabData; className?: string }) {
  return (
    <div className={cn("glass-strong rounded-card p-[13px]", className)}>
      <div className="flex items-center justify-between px-0.5 pb-[11px]">
        <span className="flex items-center font-mono text-[11px] font-medium tracking-[0.16em] text-ink">
          <span
            aria-hidden
            className="mr-2 inline-block size-1.5 shrink-0 rounded-[1px] bg-gold"
          />
          ART
        </span>
        <span className="font-mono text-meta text-muted">{data.cert}</span>
      </div>

      <div className="relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-[9px] border border-hairline-faint bg-[repeating-linear-gradient(135deg,var(--ag-surface-sunken),var(--ag-surface-sunken)_9px,var(--ag-surface)_9px,var(--ag-surface)_18px)]">
        {data.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- fixture-only
          // until M3; swaps to next/image when R2 serves real card scans.
          <img
            src={data.image}
            alt={`${data.name}, ${data.year} ${data.set}`}
            className="size-full object-cover"
          />
        ) : (
          <span className="rounded-[5px] bg-surface/85 px-[9px] py-[5px] font-mono text-meta uppercase tracking-[0.2em] text-muted">
            {data.category}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2.5 px-[3px] pb-0.5 pt-[13px]">
        <div>
          <div className="font-serif text-[17px] font-medium leading-[1.1] text-ink">
            {data.name}
          </div>
          <div className="mt-[5px] font-mono text-meta text-muted">
            {data.year} · {data.set}
          </div>
        </div>
        <GradeBadge grade={data.grade} label={data.label} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the fixtures**

`components/slab/fixtures.ts`:

```ts
import type { SlabData } from "./slab";

/**
 * Gallery-only sample data, lifted from the design file.
 *
 * NOT business data. Grades, certificate numbers and the grading scale itself
 * are client-supplied per CLAUDE.md; nothing here may be rendered on a public
 * page or treated as a real record.
 */
export const SAMPLE_SLABS: SlabData[] = [
  { grade: "10", label: "GEM MINT", name: "Charizard", year: "1999", set: "Base · Holo", cert: "ART-08831204", category: "TCG" },
  { grade: "9.5", label: "MINT+", name: "Michael Jordan", year: "1986", set: "Fleer #57", cert: "ART-08830417", category: "Sports" },
  { grade: "10", label: "GEM MINT", name: "Pikachu", year: "1998", set: "Promo · Holo", cert: "ART-08827781", category: "TCG" },
  { grade: "9", label: "MINT", name: "LeBron James", year: "2003", set: "Topps Chrome", cert: "ART-08826650", category: "Sports" },
];
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run components/slab/slab.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add components/slab/
git commit -m "feat: add Slab and GradeBadge components"
```

---

### Task 8: Stat and StatStrip

**Files:**
- Create: `components/ui/stat.tsx`
- Test: `components/ui/stat.test.tsx`

**Interfaces:**
- Consumes: `cn`.
- Produces:
  - `Stat({ value: string; label: string; className?: string })`
  - `StatStrip({ className?: string; children: ReactNode })`

- [ ] **Step 1: Write the failing test**

Create `components/ui/stat.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Stat, StatStrip } from "./stat";

describe("Stat", () => {
  test("renders the value and the label", () => {
    renderWithIntl(<Stat value="1.2M+" label="Cards certified" />);
    expect(screen.getByText("1.2M+")).toBeInTheDocument();
    expect(screen.getByText("Cards certified")).toBeInTheDocument();
  });
});

describe("StatStrip", () => {
  test("renders each child stat", () => {
    renderWithIntl(
      <StatStrip>
        <Stat value="48hr" label="Express" />
        <Stat value="100%" label="Guaranteed" />
      </StatStrip>,
    );
    expect(screen.getByText("48hr")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  test("stacks two-up on small viewports before going to a row", () => {
    renderWithIntl(
      <StatStrip>
        <Stat value="1" label="a" />
      </StatStrip>,
    );
    const strip = screen.getByText("1").closest("div[class*='grid']");
    expect(strip?.className).toContain("grid-cols-2");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/stat.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementation**

`components/ui/stat.tsx`:

```tsx
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A single rule-bounded figure: big serif numeral over a mono caption. */
export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("py-[26px] pr-1", className)}>
      <div className="font-serif text-[34px] font-medium tracking-[-0.01em] text-ink">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
    </div>
  );
}

/**
 * The horizontal rule-bounded row of figures under the hero.
 *
 * The design is a flex row at 1180px only. Below `md` that squeezes four
 * numerals into unreadable columns, so it becomes a 2x2 grid first.
 */
export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 border-y border-hairline md:flex md:gap-0",
        "[&>*]:md:flex-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/stat.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/stat.tsx components/ui/stat.test.tsx
git commit -m "feat: add Stat and StatStrip"
```

---

### Task 9: SegmentedControl

**Files:**
- Create: `components/ui/segmented-control.tsx`
- Test: `components/ui/segmented-control.test.tsx`

**Interfaces:**
- Consumes: `cn`, `@base-ui-components/react/toggle-group`, `@base-ui-components/react/toggle`.
- Produces: `SegmentedControl({ options, value, onValueChange, label, className })` where `options: { value: string; label: string }[]`, `value: string`, `onValueChange: (value: string) => void`, `label: string` (the accessible group name), `className?: string`.

**Two Base UI details that will bite an implementer:**
1. `ToggleGroup`'s `value` is an **array** even when `multiple` is false. Pass `[value]` and read `next[0]`.
2. `Toggle` renders `aria-pressed`, **not** `aria-checked`. Assert accordingly. (The spec's testing table says `aria-checked`; it is wrong and Task 16 corrects it.)

- [ ] **Step 1: Write the failing test**

Create `components/ui/segmented-control.test.tsx`:

```tsx
import { useState } from "react";
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "sports", label: "Sports" },
  { value: "tcg", label: "TCG" },
];

function Harness() {
  const [value, setValue] = useState("all");
  return (
    <SegmentedControl
      label="Filter cards"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

describe("SegmentedControl", () => {
  test("renders one button per option", () => {
    renderWithIntl(<Harness />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  test("marks the selected option as pressed", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "TCG" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("selects a different option on click", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("button", { name: "TCG" }));
    expect(screen.getByRole("button", { name: "TCG" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("never clears the selection when the active option is clicked again", async () => {
    // A segmented control is single-select: clicking the pressed option must
    // be a no-op, not a toggle-off. ToggleGroup would happily return [].
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("moves focus with the arrow keys", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.tab();
    expect(screen.getByRole("button", { name: "All" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Sports" })).toHaveFocus();
  });

  test("names the group for assistive technology", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("group", { name: "Filter cards" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/segmented-control.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementation**

`components/ui/segmented-control.tsx`:

```tsx
"use client";

import { Toggle } from "@base-ui-components/react/toggle";
import { ToggleGroup } from "@base-ui-components/react/toggle-group";

import { cn } from "@/lib/cn";

export type SegmentedOption = { value: string; label: string };

/**
 * A single-select pill group — the design's `.seg`.
 *
 * Base UI's ToggleGroup models value as an ARRAY even with `multiple={false}`,
 * and will hand back an empty array when the pressed item is clicked again.
 * Both are normalised here so callers get a plain always-present string.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        // Empty means the active item was clicked again. A segmented control
        // always has exactly one selection, so ignore it.
        if (next.length > 0) onValueChange(String(next[0]));
      }}
      className={cn("glass inline-flex gap-[3px] rounded-group p-1", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            "focus-ring cursor-pointer rounded-control border border-transparent px-[18px] py-[9px] text-sm font-medium text-muted transition-colors duration-150",
            "hover:text-ink",
            "data-[pressed]:border-[var(--ag-glass-border)] data-[pressed]:bg-[linear-gradient(180deg,rgb(255_255_255/0.18),rgb(255_255_255/0.06))] data-[pressed]:text-gold-ink",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/segmented-control.test.tsx`
Expected: PASS, 6 tests.

If the group-name test fails because Base UI renders a `div` without `role="group"`, add `role="group"` explicitly to the `ToggleGroup` — do not change the assertion.

- [ ] **Step 5: Commit**

```bash
git add components/ui/segmented-control.tsx components/ui/segmented-control.test.tsx
git commit -m "feat: add SegmentedControl on Base UI ToggleGroup"
```

---

### Task 10: Field, FieldInput and FieldSelect

**Files:**
- Create: `components/ui/field.tsx`
- Test: `components/ui/field.test.tsx`

**Interfaces:**
- Consumes: `cn`, `@base-ui-components/react/field`.
- Produces:
  - `Field({ label, children, className })` — wraps a control and its label.
  - `FieldInput(props: ComponentProps<"input">)`
  - `FieldSelect(props: ComponentProps<"select">)`

Base UI's `Field.Root` / `Field.Label` / `Field.Control` generate and wire the `id`/`htmlFor` pair, so no component here hand-rolls `aria-describedby`. `Field.Control` renders an `<input>` by default; the `render` prop swaps in a `<select>`.

- [ ] **Step 1: Write the failing test**

Create `components/ui/field.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Field, FieldInput, FieldSelect } from "./field";

describe("Field", () => {
  test("associates the label with the input", () => {
    renderWithIntl(
      <Field label="Card name">
        <FieldInput placeholder="e.g. Charizard" />
      </Field>,
    );
    // getByLabelText only resolves when the association is real.
    expect(screen.getByLabelText("Card name")).toBeInTheDocument();
  });

  test("typing updates the input", async () => {
    const { user } = renderWithIntl(
      <Field label="Card name">
        <FieldInput />
      </Field>,
    );
    const input = screen.getByLabelText("Card name");
    await user.type(input, "Blastoise");
    expect(input).toHaveValue("Blastoise");
  });

  test("associates the label with a select", () => {
    renderWithIntl(
      <Field label="Service level">
        <FieldSelect>
          <option value="std">Standard</option>
          <option value="exp">Express</option>
        </FieldSelect>
      </Field>,
    );
    expect(screen.getByLabelText("Service level").tagName).toBe("SELECT");
  });

  test("selecting an option updates the value", async () => {
    const { user } = renderWithIntl(
      <Field label="Service level">
        <FieldSelect defaultValue="std">
          <option value="std">Standard</option>
          <option value="exp">Express</option>
        </FieldSelect>
      </Field>,
    );
    const select = screen.getByLabelText("Service level");
    await user.selectOptions(select, "exp");
    expect(select).toHaveValue("exp");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/field.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementation**

`components/ui/field.tsx`:

```tsx
import { Field as BaseField } from "@base-ui-components/react/field";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Shared control chrome for text inputs and selects. */
const controlClass =
  "focus-ring h-[50px] w-full appearance-none rounded-control border border-hairline bg-surface-raised px-3.5 font-sans text-[15px] text-ink transition-colors duration-150 placeholder:text-muted focus-visible:border-gold";

/**
 * A labelled form control.
 *
 * Base UI's Field generates the id and the `htmlFor` that binds them, and will
 * wire `aria-describedby` for descriptions and errors when M3 adds validation.
 * Nothing here should hand-roll those attributes.
 */
export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseField.Root className={cn("mb-[18px] flex flex-col gap-2", className)}>
      <BaseField.Label className="font-mono text-label uppercase text-muted">
        {label}
      </BaseField.Label>
      {children}
    </BaseField.Root>
  );
}

export function FieldInput({ className, ...props }: ComponentProps<"input">) {
  return <BaseField.Control className={cn(controlClass, className)} {...props} />;
}

export function FieldSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <BaseField.Control
      render={<select />}
      className={cn(
        controlClass,
        "cursor-pointer bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>\")] bg-[position:right_16px_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/field.test.tsx`
Expected: PASS, 4 tests.

If `FieldSelect` fails to forward `children` through the `render` prop, pass them explicitly: `render={<select>{props.children}</select>}`.

- [ ] **Step 5: Commit**

```bash
git add components/ui/field.tsx components/ui/field.test.tsx
git commit -m "feat: add Field, FieldInput and FieldSelect on Base UI Field"
```

---

### Task 11: Switch

**Files:**
- Create: `components/ui/switch.tsx`
- Test: `components/ui/switch.test.tsx`

**Interfaces:**
- Consumes: `cn`, `@base-ui-components/react/switch`.
- Produces: `Switch({ checked, onCheckedChange, label, disabled?, className? })` where `label: string` is the accessible name and `onCheckedChange: (checked: boolean) => void`.

Base UI's `Switch.Root` renders `role="switch"` with `aria-checked`, confirmed in the package. Its `onCheckedChange` signature is `(checked, eventDetails)` — the wrapper narrows it to just the boolean.

- [ ] **Step 1: Write the failing test**

Create `components/ui/switch.test.tsx`:

```tsx
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Switch } from "./switch";

function Harness({ onChange }: { onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      label="Insured return shipping"
      checked={on}
      onCheckedChange={(v) => {
        setOn(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Switch", () => {
  test("exposes the switch role with an accessible name", () => {
    renderWithIntl(<Harness />);
    expect(
      screen.getByRole("switch", { name: "Insured return shipping" }),
    ).toBeInTheDocument();
  });

  test("starts unchecked", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("toggles on click", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("toggles with the space key", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("reports the new value as a plain boolean", async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("does not toggle when disabled", async () => {
    const { user } = renderWithIntl(
      <Switch label="Off limits" checked={false} disabled onCheckedChange={() => {}} />,
    );
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/switch.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementation**

`components/ui/switch.tsx`:

```tsx
"use client";

import { Switch as BaseSwitch } from "@base-ui-components/react/switch";

import { cn } from "@/lib/cn";

/**
 * The iOS-style toggle from the liquid glass variant.
 *
 * Base UI's `onCheckedChange` is `(checked, eventDetails)`; the second
 * argument is dropped here so callers can pass a plain `setState`.
 *
 * The track is 54x32, under the 44px touch floor in one dimension, so a
 * pseudo-element extends the hit area vertically without changing the visual.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <BaseSwitch.Root
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      className={cn(
        "focus-ring relative h-8 w-[54px] shrink-0 cursor-pointer rounded-full border border-[var(--ag-glass-border)] bg-[var(--ag-glass-bg)] p-0 transition-[background,border-color] duration-200",
        "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        "data-[checked]:border-gold-line data-[checked]:bg-[linear-gradient(180deg,var(--ag-gold-bright),var(--ag-gold))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block size-[26px] translate-x-0.5 rounded-full bg-[linear-gradient(180deg,#fff,#e6e4dc)] shadow-[0_2px_7px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.9)]",
          "transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.5,1)]",
          "data-[checked]:translate-x-6",
        )}
      />
    </BaseSwitch.Root>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/switch.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ui/switch.tsx components/ui/switch.test.tsx
git commit -m "feat: add Switch on Base UI Switch"
```

---

### Task 12: Accordion

**Files:**
- Create: `components/ui/accordion.tsx`
- Test: `components/ui/accordion.test.tsx`

**Interfaces:**
- Consumes: `cn`, `@base-ui-components/react/accordion`.
- Produces: `Accordion({ items, className })` where `items: { id: string; question: string; answer: string }[]`.

`Accordion.Trigger` emits `aria-expanded` and `aria-controls`, confirmed in the package.

- [ ] **Step 1: Write the failing test**

Create `components/ui/accordion.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Accordion } from "./accordion";

const ITEMS = [
  { id: "a", question: "How long does grading take?", answer: "It depends on the service level." },
  { id: "b", question: "What does the grade mean?", answer: "Four sub-grades make a final 1-10." },
];

describe("Accordion", () => {
  test("renders a trigger per item", () => {
    renderWithIntl(<Accordion items={ITEMS} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("starts fully collapsed", () => {
    renderWithIntl(<Accordion items={ITEMS} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByText(ITEMS[0].answer)).not.toBeInTheDocument();
  });

  test("opens an item on click", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    await user.click(screen.getByRole("button", { name: /How long/ }));
    expect(screen.getByRole("button", { name: /How long/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(ITEMS[0].answer)).toBeInTheDocument();
  });

  test("closes the item again on a second click", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    const trigger = screen.getByRole("button", { name: /How long/ });
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("points the trigger at the panel it controls", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    const trigger = screen.getByRole("button", { name: /How long/ });
    await user.click(trigger);
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toHaveTextContent(ITEMS[0].answer);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run components/ui/accordion.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 3: Write the implementation**

`components/ui/accordion.tsx`:

```tsx
"use client";

import { Accordion as BaseAccordion } from "@base-ui-components/react/accordion";

import { cn } from "@/lib/cn";

export type AccordionItem = { id: string; question: string; answer: string };

/**
 * The FAQ list. The design's `+` / `−` sign is rendered with CSS rather than
 * two glyphs so assistive technology reads only the question text — the state
 * is already carried by `aria-expanded`.
 */
export function Accordion({
  items,
  className,
}: {
  items: AccordionItem[];
  className?: string;
}) {
  return (
    <BaseAccordion.Root className={cn("border-t border-hairline", className)}>
      {items.map((item) => (
        <BaseAccordion.Item key={item.id} className="border-b border-hairline">
          <BaseAccordion.Header>
            <BaseAccordion.Trigger
              className={cn(
                "focus-ring group flex w-full cursor-pointer items-center justify-between gap-6 bg-transparent px-1 py-6 text-left text-lg font-semibold text-ink transition-colors duration-150",
                "hover:text-gold-ink",
              )}
            >
              {item.question}
              <span
                aria-hidden
                className="w-5 shrink-0 text-center font-mono text-xl text-gold-ink after:content-['+'] group-data-[panel-open]:after:content-['−']"
              />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="max-w-[780px] px-1 pb-[26px] text-base leading-[1.65] text-muted">
            {item.answer}
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run components/ui/accordion.test.tsx`
Expected: PASS, 5 tests.

If the collapsed-state test fails because Base UI keeps the panel mounted with `hidden`, change the two `queryByText`/`getByText` answer assertions to check visibility via `toBeVisible()` / `not.toBeVisible()` rather than presence. Do not weaken the `aria-expanded` assertions.

- [ ] **Step 5: Commit**

```bash
git add components/ui/accordion.tsx components/ui/accordion.test.tsx
git commit -m "feat: add Accordion on Base UI Accordion"
```

---

### Task 13: AmbientGlow and ThemeToggle

**Files:**
- Create: `components/layout/ambient-glow.tsx`, `components/layout/theme-toggle.tsx`
- Test: `components/layout/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: `cn`, `SegmentedControl` from Task 9, and the `a11y` message block — which **Step 1 of this task adds**, so the component is testable before the shell exists. Task 14 adds `nav` and `footer` separately and does not touch `a11y`.
- Produces: `AmbientGlow()` (no props), `ThemeToggle()` (no props).

- [ ] **Step 1: Add the a11y message keys**

Modify `messages/en.json`. Add a top-level `a11y` block after `common`:

```json
  "a11y": {
    "theme": "Colour theme",
    "themeLight": "Light",
    "themeDark": "Dark",
    "themeSystem": "System"
  }
```

- [ ] **Step 2: Write the failing test**

Create `components/layout/theme-toggle.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  test("offers light, dark and system", () => {
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.a11y.themeDark }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.a11y.themeSystem }),
    ).toBeInTheDocument();
  });

  test("defaults to system when nothing is stored", () => {
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeSystem }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("choosing dark stamps the document and persists the choice", async () => {
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("choosing system clears both the attribute and the stored value", async () => {
    // This is what hands control back to prefers-color-scheme. Leaving a
    // stale data-theme behind would pin the user to their last explicit pick.
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    await user.click(screen.getByRole("button", { name: messages.a11y.themeSystem }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  test("reflects an already-stored choice on mount", () => {
    localStorage.setItem("theme", "light");
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run components/layout/theme-toggle.test.tsx`
Expected: FAIL — module unresolved.

- [ ] **Step 4: Write AmbientGlow**

`components/layout/ambient-glow.tsx`:

```tsx
/**
 * The three fixed radial blobs behind the page.
 *
 * Purely decorative, so `aria-hidden` and no pointer events. Intensity is
 * themed through `--ag-glow-opacity`: a faint gold wash on paper (0.18), the
 * full effect on black (0.55), and nothing at all when the user has asked for
 * reduced transparency.
 */
export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[var(--ag-glow-opacity)] motion-reduce:hidden [@media(prefers-reduced-transparency:reduce)]:hidden"
    >
      <div className="absolute -left-[130px] -top-[170px] size-[620px] rounded-full bg-[radial-gradient(circle,var(--ag-gold),transparent_70%)] opacity-[0.42] blur-[130px]" />
      <div className="absolute -right-[240px] top-[560px] size-[720px] rounded-full bg-[radial-gradient(circle,var(--ag-glow-cool),transparent_70%)] opacity-[0.24] blur-[130px]" />
      <div className="absolute bottom-[240px] left-[32%] size-[560px] rounded-full bg-[radial-gradient(circle,var(--ag-gold),transparent_70%)] opacity-[0.16] blur-[130px]" />
    </div>
  );
}
```

- [ ] **Step 5: Write ThemeToggle**

`components/layout/theme-toggle.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";

type Choice = "light" | "dark" | "system";

function readStored(): Choice {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Light / dark / system.
 *
 * "System" is not a third stamped value — it REMOVES `data-theme` so the
 * `prefers-color-scheme` block in globals.css becomes authoritative again.
 * Writing `data-theme="system"` instead would match neither branch of the
 * `dark` variant and silently pin the user to light.
 */
export function ThemeToggle() {
  const t = useTranslations("a11y");
  const [choice, setChoice] = useState<Choice>("system");

  // Read after mount, not during render: the server has no localStorage, and
  // reading it during render would produce a hydration mismatch.
  useEffect(() => {
    setChoice(readStored());
  }, []);

  function apply(next: string) {
    const value = next as Choice;
    setChoice(value);

    try {
      if (value === "system") {
        localStorage.removeItem("theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("theme", value);
        document.documentElement.dataset.theme = value;
      }
    } catch {
      // Private-mode Safari throws on localStorage. The in-page choice still
      // applies; it just will not survive a reload.
    }
  }

  return (
    <SegmentedControl
      label={t("theme")}
      value={choice}
      onValueChange={apply}
      options={[
        { value: "light", label: t("themeLight") },
        { value: "dark", label: t("themeDark") },
        { value: "system", label: t("themeSystem") },
      ]}
    />
  );
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run components/layout/theme-toggle.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add components/layout/ambient-glow.tsx components/layout/theme-toggle.tsx components/layout/theme-toggle.test.tsx messages/en.json
git commit -m "feat: add AmbientGlow and ThemeToggle"
```

---

### Task 14: Site shell — header, footer, messages

**Files:**
- Modify: `messages/en.json`
- Create: `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`
- Test: `components/layout/site-header.test.tsx`, `components/layout/site-footer.test.tsx`
- Modify: `app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: `Container`, `Button`/`buttonVariants`, `ThemeToggle`, `AmbientGlow`, `Link` from `@/i18n/navigation`.
- Produces: `SiteHeader()`, `SiteFooter()` (both no props).

- [ ] **Step 1: Add the nav and footer messages**

Modify `messages/en.json`. Extend the existing `nav` block with two keys and add a `footer` block. The existing `nav` keys stay untouched:

```json
  "nav": {
    "home": "Home",
    "howItWorks": "How it works",
    "showcase": "Showcase",
    "pricing": "Pricing",
    "popReport": "Pop Report",
    "faq": "FAQ",
    "submit": "Submit cards",
    "signIn": "Sign in"
  },
  "footer": {
    "tagline": "Precision grading and authentication for sports cards and trading card games.",
    "service": "Service",
    "company": "Company",
    "support": "Support",
    "about": "About",
    "standard": "Authentication standard",
    "track": "Track a submission",
    "certLookup": "Certificate lookup",
    "contact": "Contact",
    "copyright": "© {year} ArtsGrading",
    "legal": "Privacy · Terms"
  }
```

Place `showcase` and `pricing` inside `nav`, and the `footer` block after `nav`. `global.d.ts` types message keys off this file, so the new keys become available to `t()` with no other change.

**Declared deviation from the spec.** The spec specifies a Base UI `navigation-menu` drawer below `md`. This task does not build one: there are four links, none of the pages behind them exist yet, and a drawer built now would be rewritten when the real M1 page set lands. Below `lg` the link row is simply hidden, leaving the wordmark, theme toggle and CTA — all of which fit. The drawer is M1 page work, and `navigation-menu` stays in the dependency's confirmed-available list for then. Do not add a `nav.menu` message key until the drawer exists; an unused key is a translation cost with no rendering.

- [ ] **Step 2: Write the failing tests**

Create `components/layout/site-header.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  test("renders the primary navigation links", () => {
    renderWithIntl(<SiteHeader />);
    expect(
      screen.getByRole("link", { name: messages.nav.howItWorks }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.nav.faq })).toBeInTheDocument();
  });

  test("renders the submit call to action", () => {
    renderWithIntl(<SiteHeader />);
    expect(
      screen.getByRole("link", { name: new RegExp(messages.nav.submit) }),
    ).toHaveAttribute("href", "/submit");
  });

  test("exposes a landmark for the navigation", () => {
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  test("uses unprefixed hrefs for the default locale", () => {
    // `as-needed` prefixing means English URLs must have no /en segment.
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("link", { name: messages.nav.faq })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
```

Create `components/layout/site-footer.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  test("renders the column headings", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByText(messages.footer.service)).toBeInTheDocument();
    expect(screen.getByText(messages.footer.company)).toBeInTheDocument();
    expect(screen.getByText(messages.footer.support)).toBeInTheDocument();
  });

  test("renders the tagline", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByText(messages.footer.tagline)).toBeInTheDocument();
  });

  test("interpolates the current year into the copyright", () => {
    renderWithIntl(<SiteFooter />);
    const year = String(new Date().getFullYear());
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });

  test("exposes a contentinfo landmark", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run components/layout/site-header.test.tsx components/layout/site-footer.test.tsx`
Expected: FAIL — both modules unresolved.

- [ ] **Step 4: Write SiteHeader**

`components/layout/site-header.tsx`:

```tsx
import { useTranslations } from "next-intl";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** The typographic wordmark. Logo design is out of scope; this is the design's own mark. */
function Wordmark() {
  return (
    <Link
      href="/"
      className="focus-ring flex items-baseline font-serif text-[23px] font-medium text-ink"
    >
      Art<span className="text-gold">.</span>
    </Link>
  );
}

export function SiteHeader() {
  const t = useTranslations("nav");

  const links = [
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/pop-report", label: t("popReport") },
    { href: "/pricing", label: t("pricing") },
    { href: "/faq", label: t("faq") },
  ] as const;

  return (
    <header className="glass sticky top-0 z-50 border-x-0 border-t-0 rounded-none">
      <Container>
        <nav className="flex h-[70px] items-center justify-between">
          <Wordmark />

          {/* Below `lg` the link row is replaced by the theme toggle and the
              CTA alone. A drawer arrives with the real page set in M1; there
              are four links and nothing to hide behind a hamburger yet. */}
          <div className="hidden items-center gap-[30px] lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="focus-ring text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3.5">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="focus-ring hidden text-sm font-medium text-muted transition-colors duration-150 hover:text-ink sm:block"
            >
              {t("signIn")}
            </Link>
            <Link
              href="/submit"
              className={cn(buttonVariants({ variant: "gold", size: "sm" }))}
            >
              {t("submit")} <span aria-hidden className="font-mono">→</span>
            </Link>
          </div>
        </nav>
      </Container>
    </header>
  );
}
```

- [ ] **Step 5: Write SiteFooter**

`components/layout/site-footer.tsx`:

```tsx
import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

function Column({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {heading}
      </h2>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-ring mb-[11px] block text-sm text-ink/80 transition-colors duration-150 hover:text-gold-ink"
    >
      {children}
    </Link>
  );
}

export function SiteFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");

  return (
    <footer className="surface-invert">
      <Container>
        <div className="border-t border-hairline pb-[50px] pt-[70px]">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <span className="flex items-baseline font-serif text-[23px] font-medium text-ink">
                Art<span className="text-gold">.</span>
              </span>
              <p className="mt-4 max-w-[260px] text-sm text-muted">{t("tagline")}</p>
            </div>

            <Column heading={t("service")}>
              <FooterLink href="/how-it-works">{nav("howItWorks")}</FooterLink>
              <FooterLink href="/pricing">{nav("pricing")}</FooterLink>
              <FooterLink href="/submit">{nav("submit")}</FooterLink>
              <FooterLink href="/pop-report">{nav("popReport")}</FooterLink>
            </Column>

            <Column heading={t("company")}>
              <FooterLink href="/about">{t("about")}</FooterLink>
              <FooterLink href="/standard">{t("standard")}</FooterLink>
            </Column>

            <Column heading={t("support")}>
              <FooterLink href="/faq">{nav("faq")}</FooterLink>
              <FooterLink href="/track">{t("track")}</FooterLink>
              <FooterLink href="/cert">{t("certLookup")}</FooterLink>
              <FooterLink href="/contact">{t("contact")}</FooterLink>
            </Column>
          </div>

          <div className="mt-14 flex flex-col gap-3 border-t border-hairline pt-[26px] font-mono text-[11px] tracking-[0.08em] text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>{t("copyright", { year: new Date().getFullYear() })}</span>
            <span>{t("legal")}</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run components/layout/site-header.test.tsx components/layout/site-footer.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 7: Mount the shell in the layout**

Modify `app/[locale]/layout.tsx`. Add the three imports and wrap `{children}`; everything else in the file stays as Task 3 left it.

Add to the imports:

```tsx
import { AmbientGlow } from "@/components/layout/ambient-glow";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
```

Replace the provider block:

```tsx
        <NextIntlClientProvider>
          <AmbientGlow />
          {/* The glow is `position: fixed` at z-0, so page content needs its
              own stacking context to sit above it. */}
          <div className="relative z-10 flex min-h-full flex-col">
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
            <SiteFooter />
          </div>
        </NextIntlClientProvider>
```

`app/[locale]/page.tsx` currently renders its own `<main>`. Change that element to a `<div>` so the document has exactly one `main` landmark; leave everything else in the file alone.

- [ ] **Step 8: Verify the whole suite and the build**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: succeeds, both locales static.

- [ ] **Step 9: Commit**

```bash
git add messages/en.json components/layout/ "app/[locale]/layout.tsx" "app/[locale]/page.tsx"
git commit -m "feat: add site header, footer and shell integration"
```

---

### Task 15: The `/design` gallery

**Files:**
- Create: `app/[locale]/design/page.tsx`
- Create: `app/[locale]/design/_sections/color-section.tsx`, `type-section.tsx`, `surface-section.tsx`, `control-section.tsx`, `slab-section.tsx`

**Interfaces:**
- Consumes: every component built so far.
- Produces: a route at `/design`.

The `_sections` prefix keeps the directory out of routing. Copy in these files is exempt from the no-hardcoded-strings rule — Task 16 documents that.

- [ ] **Step 1: Write the colour section**

`app/[locale]/design/_sections/color-section.tsx`:

```tsx
const ROLE_TOKENS = [
  "surface",
  "surface-sunken",
  "surface-raised",
  "ink",
  "ink-strong",
  "muted",
  "hairline",
  "gold",
  "gold-ink",
  "gold-bright",
  "gold-soft",
  "gold-line",
  "on-gold",
] as const;

export function ColorSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Colour</h2>
      <p className="mt-2 max-w-prose text-lead text-muted">
        Every swatch is a role, not a value. <code className="font-mono">gold</code> is
        for fills and borders; <code className="font-mono">gold-ink</code> is the only
        gold permitted as text — the decorative one measures 3.13:1 on paper and fails
        WCAG AA.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ROLE_TOKENS.map((token) => (
          <div key={token} className="rounded-card border border-hairline p-3">
            <div
              className="h-16 w-full rounded-control border border-hairline-faint"
              style={{ background: `var(--ag-${token})` }}
            />
            <div className="mt-2 font-mono text-meta text-ink">{token}</div>
            <div className="font-mono text-meta text-muted">--ag-{token}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the type section**

`app/[locale]/design/_sections/type-section.tsx`:

```tsx
import { Eyebrow } from "@/components/ui/eyebrow";
import { Kicker } from "@/components/ui/kicker";

export function TypeSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Typography</h2>
      <div className="mt-8 flex flex-col gap-8">
        <div>
          <Kicker>text-display · Newsreader</Kicker>
          <p className="mt-2 font-serif text-display text-ink">
            What your cards are worth, made certain.
          </p>
        </div>
        <div>
          <Kicker>text-h2 · Newsreader</Kicker>
          <p className="mt-2 font-serif text-h2 text-ink">
            Four steps from mailbox to vaulted.
          </p>
        </div>
        <div>
          <Kicker>text-h3 · Newsreader</Kicker>
          <p className="mt-2 font-serif text-h3 text-ink">Seal and return</p>
        </div>
        <div>
          <Kicker>text-lead · Hanken Grotesk</Kicker>
          <p className="mt-2 max-w-prose text-lead text-muted">
            A documented, insured chain of custody for every card.
          </p>
        </div>
        <div>
          <Kicker>Eyebrow and Kicker · JetBrains Mono</Kicker>
          <div className="mt-2 flex flex-col gap-2">
            <Eyebrow>Recently graded</Eyebrow>
            <Kicker>Order summary</Kicker>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the surface section**

`app/[locale]/design/_sections/surface-section.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

export function SurfaceSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Surfaces</h2>
      <p className="mt-2 max-w-prose text-lead text-muted">
        The glass utilities resolve per theme: frosted white on paper, full liquid glass
        on black. Radii are themed too — cards grow from 13px to 18px in dark, because
        blur reads softer.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="p-6">
          <div className="font-mono text-meta text-muted">Card · solid</div>
          <p className="mt-2 text-ink">bg-surface-raised, hairline, shadow-card</p>
        </Card>
        <Card variant="glass" className="p-6">
          <div className="font-mono text-meta text-muted">Card · glass</div>
          <p className="mt-2 text-ink">the `glass` utility</p>
        </Card>
        <div className="glass-strong rounded-panel p-6">
          <div className="font-mono text-meta text-muted">glass-strong</div>
          <p className="mt-2 text-ink">elevated frosted panel</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Chip>Order ART-20481104</Chip>
        <Chip>TCG</Chip>
      </div>
      <div className="surface-invert mt-6 rounded-panel p-6">
        <div className="font-mono text-meta text-muted">surface-invert</div>
        <p className="mt-2 text-ink">
          Role tokens redefined locally — including gold-ink, which flips to the
          brighter gold because the darkened one fails on ink.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the control section**

`app/[locale]/design/_sections/control-section.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";

const FAQ_ITEMS = [
  {
    id: "turnaround",
    question: "How long does grading take?",
    answer: "Turnaround depends on the service level. (Placeholder — client-supplied.)",
  },
  {
    id: "grade",
    question: "What does the grade mean?",
    answer: "Four sub-grades combine into a final score. (Placeholder — client-supplied.)",
  },
];

export function ControlSection() {
  const [filter, setFilter] = useState("all");
  const [insured, setInsured] = useState(true);

  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Controls</h2>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button>Submit a card</Button>
        <Button variant="ink">Secondary</Button>
        <Button variant="ghost">View pricing</Button>
        <Button size="sm">Small gold</Button>
        <Button variant="ghost" size="sm">
          Small ghost
        </Button>
        <Button disabled>Disabled</Button>
      </div>

      <div className="mt-8">
        <SegmentedControl
          label="Filter showcase"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "sports", label: "Sports" },
            { value: "tcg", label: "TCG" },
          ]}
        />
      </div>

      <div className="mt-8 grid max-w-xl grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Card / player name">
          <FieldInput placeholder="e.g. Charizard" />
        </Field>
        <Field label="Service level">
          <FieldSelect defaultValue="std">
            <option value="eco">Economy</option>
            <option value="std">Standard</option>
            <option value="exp">Express</option>
          </FieldSelect>
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-5 border-t border-hairline pt-5 sm:max-w-xl">
        <div>
          <div className="font-semibold text-ink">Insured return shipping</div>
          <div className="text-sm text-muted">Full declared-value coverage</div>
        </div>
        <Switch
          label="Insured return shipping"
          checked={insured}
          onCheckedChange={setInsured}
        />
      </div>

      <div className="mt-10 max-w-2xl">
        <Accordion items={FAQ_ITEMS} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the slab section**

`app/[locale]/design/_sections/slab-section.tsx`:

```tsx
import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import { GradeBadge } from "@/components/slab/grade-badge";
import { Slab } from "@/components/slab/slab";
import { Stat, StatStrip } from "@/components/ui/stat";

export function SlabSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Slab</h2>
      <p className="mt-2 max-w-prose text-lead text-muted">
        Sample data only. Grades, certificate numbers, and the grading scale itself are
        client-supplied and must never be rendered on a public page from these fixtures.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_SLABS.map((slab) => (
          <Slab key={slab.cert} data={slab} />
        ))}
      </div>
      <div className="mt-8 flex items-end gap-6">
        <GradeBadge grade="10" label="GEM MINT" />
        <GradeBadge grade="9.5" label="MINT+" size="lg" />
      </div>
      <div className="mt-10">
        <StatStrip>
          <Stat value="1.2M+" label="Cards certified" />
          <Stat value="48hr" label="Vault express" />
          <Stat value="100%" label="Guarantee" />
          <Stat value="4-point" label="Sub-grade report" />
        </StatStrip>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

`app/[locale]/design/page.tsx`:

```tsx
import type { Metadata } from "next";

import { Container } from "@/components/ui/container";

import { ColorSection } from "./_sections/color-section";
import { ControlSection } from "./_sections/control-section";
import { SlabSection } from "./_sections/slab-section";
import { SurfaceSection } from "./_sections/surface-section";
import { TypeSection } from "./_sections/type-section";

/**
 * Internal design system gallery.
 *
 * Deliberately NOT behind an environment check: a components page leaks
 * nothing, and gating it means it stops working exactly where you most want to
 * check a rendering bug — production. It is excluded from indexing instead.
 *
 * Copy in this route and its `_sections` is exempt from the
 * no-hardcoded-strings rule; see CLAUDE.md.
 */
export const metadata: Metadata = {
  title: "Design system — ArtsGrading",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return (
    <Container>
      <div className="flex flex-col gap-20 py-16">
        <header>
          <h1 className="font-serif text-display text-ink">Design system</h1>
          <p className="mt-4 max-w-prose text-lead text-muted">
            Every token and primitive, rendered through the real layout and fonts. Use
            the theme control in the header to check both themes.
          </p>
        </header>
        <ColorSection />
        <TypeSection />
        <SurfaceSection />
        <ControlSection />
        <SlabSection />
      </div>
    </Container>
  );
}
```

- [ ] **Step 7: Verify the build and the page**

Run: `npm run build`
Expected: succeeds. `/design` prerenders.

Run `npm run dev` and open `http://localhost:3000/design`. Check:
- Every section renders; no missing-token blank swatches.
- Toggle to dark: surfaces go to liquid glass, radii visibly grow, the ambient glow strengthens.
- Reload while dark: no light flash.
- Resize to 375px: no horizontal scrollbar anywhere on the page.

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/design/"
git commit -m "feat: add internal /design system gallery"
```

---

### Task 16: Gold guard, documentation, and full verification

**Files:**
- Create: `components/gold-ink.test.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing importable.

- [ ] **Step 1: Write the guard test**

Create `components/gold-ink.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

describe("gold token discipline", () => {
  test("no component uses text-gold as a text colour", () => {
    // `--gold` measures 3.13:1 on the light surface and fails WCAG AA for
    // text. `text-gold-ink` is the accessible one. `bg-gold`, `border-gold`
    // and `border-gold-line` are fine — the rule is about text only.
    const offenders: string[] = [];

    for (const file of [...walk("app"), ...walk("components")]) {
      const source = readFileSync(file, "utf8");
      // Matches `text-gold` but not `text-gold-ink` / `text-gold-bright`.
      for (const match of source.matchAll(/\btext-gold\b(?!-)/g)) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the guard test**

Run: `npx vitest run components/gold-ink.test.ts`
Expected: PASS. If it fails, fix the offending component — change `text-gold` to `text-gold-ink`. Do not weaken the test.

- [ ] **Step 3: Correct the spec's aria assertion**

In `docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`, the testing table row for `segmented-control.test.tsx` says `aria-checked`. Base UI's `Toggle` renders `aria-pressed`. Change that cell to read:

```
| `components/ui/segmented-control.test.tsx` | selection changes, arrow-key roving focus, `aria-pressed` (Base UI `Toggle` uses pressed, not checked) |
```

- [ ] **Step 4: Document the design system in CLAUDE.md**

Add a `## Design system` section after the `## Internationalization` section:

```markdown
## Design system

Ported from the Claude Design project *Card grading webapplication design*
(light "paper" + dark liquid glass). Spec:
`docs/superpowers/specs/2026-08-15-design-system-foundation-design.md`.

| File | Role |
|---|---|
| `app/globals.css` | The whole token layer — palettes, `@theme inline` mapping, glass utilities |
| `lib/cn.ts` | `cn()` — clsx + tailwind-merge |
| `components/ui/*` | Primitives (Button, Card, Field, Switch, Accordion, SegmentedControl, …) |
| `components/slab/*` | The branded slab and its grade badge |
| `components/layout/*` | Header, footer, ambient glow, theme script and toggle |
| `app/[locale]/design/` | Internal gallery of every token and component |

Rules:

- **Raw tokens are `--ag-*`; Tailwind namespaces map from them.** Writing
  `--radius-card: var(--radius-card)` in `@theme inline` is self-referential and
  silently resolves to nothing. The prefix is what keeps the two sides distinct.
- **`--gold` is fills, borders and decoration. `--gold-ink` is the only gold
  allowed as a text colour.** The design's `#B0883A` on `#FAFAF8` measures
  3.13:1 and fails WCAG AA. Inside `surface-invert` the relationship flips —
  which is why that utility redefines `--gold-ink` too. `components/gold-ink.test.ts`
  enforces it; never write `text-gold`.
- **The dark palette is declared twice** — once under `prefers-color-scheme`,
  once under `[data-theme=dark]` — because CSS cannot share a declaration list
  across a media boundary, and a token defined only inside the media block is
  undefined when the attribute wins. `app/globals.token.test.ts` asserts the two
  copies stay identical. Edit both.
- **Components rarely need `dark:`.** `bg-surface` emits `var(--ag-surface)`,
  which the palette blocks already swap. Reach for the variant only when a
  difference is not expressible as a token.
- **Radii are themed, not constant** (card 13px light / 18px dark). Glass reads
  softer, so the design grows its corners. Use `rounded-card` / `rounded-panel`,
  never a literal.
- **`surface-invert` is how a dark band works**, not a pile of `dark:` classes.
  It redefines the role tokens locally so nested components follow.
- **Theme selection is `data-theme` on `<html>`, and "system" means removing the
  attribute** — not setting `data-theme="system"`, which matches neither branch
  of the `dark` variant and would pin the user to light.
- **The `/design` gallery is exempt from the no-hardcoded-strings rule**, the
  same way `app/global-error.tsx` is. It is internal tooling whose labels are
  token and component names; translating "Buttons" is pure cost.
- Base UI is at a release candidate (`1.0.0-rc.0`). It supplies behaviour only —
  keyboard interaction, focus management, ARIA — and every visual is ours.
  Re-evaluate at M3 when the submission form leans on `field` and `select` hard.
```

- [ ] **Step 5: Run the full verification sequence**

```bash
npm run lint
npm run build
npx tsc --noEmit
npm test
```

Expected: lint clean, build succeeds with both locales static, typecheck clean, all tests pass. Run them in this order — `tsc` needs the route types the build generates.

- [ ] **Step 6: Manual accessibility and responsive pass**

With `npm run dev` running, on `/design`:

1. Tab through every control. Each shows a visible gold focus ring; nothing is reachable but invisible.
2. Toggle the theme and repeat — the ring must stay visible on the dark surface.
3. At 375px, 768px and 1440px there is no horizontal scroll.
4. In DevTools, emulate `prefers-reduced-transparency: reduce`. Glass surfaces become opaque and the ambient glow disappears; all text stays readable.
5. In DevTools, emulate `prefers-color-scheme: dark` with no stored choice. The page is dark. Choose Light in the toggle; it goes light and stays light on reload.

- [ ] **Step 7: Commit**

```bash
git add components/gold-ink.test.ts CLAUDE.md docs/superpowers/specs/2026-08-15-design-system-foundation-design.md
git commit -m "test: guard the gold text token; document the design system"
```

---

## Notes for the executor

- **`light-dark()` was considered and rejected** for the palette. It would remove the duplicated dark block entirely, but it accepts only `<color>` values — the themed radii, blur lengths, and the gradient `--ag-gold-fill` cannot use it, so the mechanism would be split in two. The duplication plus a test that guards it is the simpler contract. Do not "improve" this without revisiting the spec.
- **If Base UI's rendered markup differs from what a test expects**, fix the component, not the assertion — except where a step above explicitly names the fallback. The ARIA attributes asserted here (`aria-pressed` on Toggle, `aria-checked` + `role="switch"` on Switch, `aria-expanded` + `aria-controls` on Accordion.Trigger) were read out of the published 1.0.0-rc.0 package and are correct.
- **Do not add `dark:` variants reflexively.** If you find yourself writing one, check first whether the difference belongs in a token.
