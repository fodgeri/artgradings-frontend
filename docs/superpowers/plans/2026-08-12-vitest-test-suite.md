# Vitest Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vitest + React Testing Library harness for the frontend, with three seed tests that establish the patterns M1–M7 will copy.

**Architecture:** A single `vitest.config.mts` at the repo root running one jsdom environment, with `vite-tsconfig-paths` so the `@/*` alias resolves exactly as it does in the app. Tests are colocated beside their source. Two shared files under `test/` carry the reusable infrastructure: `setup.ts` (matchers + cleanup) and `i18n.tsx` (a `renderWithIntl` helper that wraps components in `NextIntlClientProvider` with the real `messages/en.json`).

**Tech Stack:** Vitest 4, React Testing Library 16, jsdom 30, `@vitejs/plugin-react` 6, `vite-tsconfig-paths` 6, `@vitest/coverage-v8` 4, `intl-messageformat` 11.

**Spec:** `docs/superpowers/specs/2026-08-12-vitest-test-suite-design.md`

> **Executed 2026-08-12.** Two things below did not survive contact and are
> recorded here rather than edited out, since the steps are a historical
> record. The spec has been updated to match what was actually built; read it,
> not this, for current truth.
>
> 1. **`vite-tsconfig-paths` was dropped.** Vite resolves tsconfig path aliases
>    natively via `resolve.tsconfigPaths` as of v7, and Vitest warns that the
>    plugin is redundant. Removing it also removed the deprecated `tsconfck`.
> 2. **`next-intl` had to be inlined** via `test.server.deps.inline`. Task 1
>    Step 6's contingency (switch to the node environment) was wrong — the
>    failure was module *resolution*, not environment. `next` ships no
>    `exports` map, so native Node ESM cannot resolve the extensionless
>    `next/navigation` that next-intl imports internally. Externalized deps are
>    loaded by Node; inlining routes them through Vite's resolver.

## Global Constraints

- **Node >= 24, npm >= 10** — enforced by `engines` in `package.json`.
- **All new packages are `devDependencies`.** None of this may reach the production bundle.
- **`globals: false`.** Every test file explicitly imports its primitives: `import { describe, expect, test } from "vitest"`. Never rely on ambient `describe`/`test`/`expect`, and never add `"types": ["vitest/globals"]` to `tsconfig.json`.
- **Tests are colocated** — `foo.test.ts` sits beside `foo.ts`. No `__tests__/` directories, no `tests/` mirror. The only exception is `test/`, which holds shared infrastructure and no tests.
- **Do not modify `tsconfig.json`.** Its existing `**/*.ts` / `**/*.tsx` / `**/*.mts` includes already cover test files and `vitest.config.mts`, and the jest-dom matcher types reach test files via the import in `test/setup.ts`.
- **Do not rename the `lint-build-typecheck` job** in `.github/workflows/ci.yml`. It may be configured as a required status check on branch protection; renaming it would silently stop blocking merges.
- **No coverage thresholds.** Coverage is reported, never gated.
- **Never assert user-facing copy as a string literal in a test.** Assert against messages resolved from `messages/en.json`, matching the rule CLAUDE.md already puts on components.

## A note on TDD in this plan

The three seed tests characterise code that already exists, so the usual
red-green cycle does not apply literally — a correct test against correct code
passes on first run. Proving the test actually bites therefore requires a
deliberate break: each task has an explicit step that edits the *source* to
introduce a fault, confirms the test goes red, and reverts. Do not skip these
steps. A pinning test that has never been seen to fail is decoration.

---

## Task 1: Harness + routing invariants

Stands up the runner and proves it works end to end with the simplest possible
test. Configuration is folded in here rather than split out, because a config
with no test proves nothing and cannot be reviewed on its own.

**Files:**
- Modify: `package.json` (devDependencies, scripts)
- Create: `vitest.config.mts`
- Create: `test/setup.ts`
- Create: `i18n/routing.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm test`; `test/setup.ts` registered as the global setup file, which Task 3 relies on for jest-dom matchers and RTL cleanup.

- [ ] **Step 1: Install the dependencies**

```bash
npm install -D vitest@^4.1 @vitejs/plugin-react@^6.0 vite-tsconfig-paths@^6.1 \
  jsdom@^30.0 @testing-library/react@^16.3 @testing-library/dom@^10.4 \
  @testing-library/jest-dom@^7.0
```

`@testing-library/dom` is a peer dependency of `@testing-library/react` and must
be installed explicitly. `@vitest/coverage-v8` and `intl-messageformat` are
installed in later tasks, alongside the code that needs them.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.mts`:

```ts
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `tsconfigPaths` makes `@/*` resolve in tests exactly as it does in the
  // app, so a test imports a module by the same specifier the app uses.
  plugins: [tsconfigPaths(), react()],
  test: {
    // One environment for everything. A test that genuinely needs Node (no
    // DOM, or Node-only APIs) opts out with a `// @vitest-environment node`
    // docblock on line 1. Splitting into `test.projects` is deferred until
    // there is enough server code (M7 webhooks) to justify it.
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    globals: false,
    include: ["**/*.test.{ts,tsx}"],
    // Setting `exclude` REPLACES Vitest's defaults rather than extending
    // them, so `node_modules` has to be listed explicitly or every test
    // fixture inside a dependency gets collected.
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
```

- [ ] **Step 3: Create the shared setup file**

Create `test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// With `globals: false` there is no ambient `afterEach` for React Testing
// Library to hook into, so its automatic cleanup never registers. Without
// this, the DOM rendered by one test survives into the next and `screen`
// queries match stale nodes — usually surfacing as a confusing
// "found multiple elements" failure in an unrelated test.
afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Add the npm scripts**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
```

`test` is single-shot so that CI, scripts and agents can never hang on the
watch prompt. Use `test:watch` for the local loop.

- [ ] **Step 5: Write the routing test**

Create `i18n/routing.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

describe("routing config", () => {
  test("defaultLocale is one of the supported locales", () => {
    expect(routing.locales).toContain(routing.defaultLocale);
  });

  test("uses the as-needed prefix strategy", () => {
    // The canonical-URL guarantee in CLAUDE.md — English unprefixed, other
    // languages prefixed, one URL per page — rests entirely on this value.
    expect(routing.localePrefix).toBe("as-needed");
  });
});

describe("getPathname", () => {
  test("leaves the default locale unprefixed", () => {
    expect(getPathname({ href: "/faq", locale: routing.defaultLocale })).toBe(
      "/faq",
    );
  });

  test("can force a prefix for the default locale", () => {
    // `forcePrefix` is how a locale switcher builds an explicit URL. Asserting
    // it here exercises the prefixing machinery without inventing a locale
    // that is not in `routing.locales`.
    expect(
      getPathname({
        href: "/faq",
        locale: routing.defaultLocale,
        forcePrefix: true,
      }),
    ).toBe("/en/faq");
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS — 1 test file, 4 tests.

If the run fails at the *import* of `@/i18n/navigation` (rather than on an
assertion), that is the one import in this plan with genuine runtime risk:
`next-intl/navigation` resolves to its react-client build, which pulls in
`next/navigation`. If and only if that import throws, add
`// @vitest-environment node` as line 1 of `i18n/routing.test.ts` and re-run —
`getPathname` is a pure function and needs no DOM. Do not mock `next/navigation`.

- [ ] **Step 7: Prove the test bites**

In `i18n/routing.ts`, temporarily change `localePrefix: "as-needed"` to
`localePrefix: "always"`.

Run: `npm test`
Expected: FAIL — 2 failures. `"uses the as-needed prefix strategy"` fails on the
config value, and `"leaves the default locale unprefixed"` fails with received
`"/en/faq"` instead of `"/faq"`.

That second failure is the important one: it shows the test catches a real
change in emitted URLs, not just a changed constant.

Now revert the change to `i18n/routing.ts` and re-run `npm test`.
Expected: PASS — 4 tests.

- [ ] **Step 8: Verify lint and types are clean**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed. The build must run first — Next 16 generates
`.next/types/` during the build, and `tsc` fails without it on a clean checkout.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.mts test/setup.ts i18n/routing.test.ts
git commit -m "test: add Vitest harness and i18n routing invariants

Single jsdom environment per Next.js's documented setup, with
vite-tsconfig-paths so @/* resolves the same in tests as in the app.
Explicit RTL cleanup in test/setup.ts is required because globals: false
leaves RTL no ambient afterEach to register against.

The routing test pins the canonical-URL guarantee: flipping localePrefix
to 'always' turns /faq into /en/faq and fails the suite."
```

---

## Task 2: Message file integrity

Catches what `i18n/messages.d-check.ts` structurally cannot. That file is a
compile-time *shape* check; a malformed ICU string such as a broken `plural` arm
is a perfectly valid `string` to TypeScript and only explodes when rendered.
`home.gradedCount` is exactly that shape.

**Files:**
- Modify: `package.json` (add `intl-messageformat`)
- Create: `messages/messages.test.ts`

**Interfaces:**
- Consumes: the harness from Task 1 (`npm test`, `vitest.config.mts`).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Install intl-messageformat**

```bash
npm install -D intl-messageformat@^11.2
```

It is already present transitively via `next-intl`, but relying on another
package's dependency tree means a `next-intl` upgrade could remove it without
warning. Declare it.

- [ ] **Step 2: Write the message integrity test**

Create `messages/messages.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, test } from "vitest";

import { routing } from "@/i18n/routing";

type MessageTree = { [key: string]: string | MessageTree };

/**
 * Reads a locale file from disk rather than importing it, so the test asserts
 * against the bytes on disk and sidesteps bundler dynamic-import semantics.
 * `process.cwd()` is the Vitest root, which is the repo root.
 */
function loadMessages(locale: string): MessageTree {
  const path = join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as MessageTree;
}

/** Flattens a nested message tree into dot-paths: `{home: {title}}` -> `home.title`. */
function flatten(tree: MessageTree, prefix = ""): Record<string, string> {
  const flat: Record<string, string> = {};

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      flat[path] = value;
    } else {
      Object.assign(flat, flatten(value, path));
    }
  }

  return flat;
}

const reference = flatten(loadMessages(routing.defaultLocale));
const referenceKeys = Object.keys(reference).sort();

test("the reference locale defines at least one message", () => {
  // Guards the suite itself: if en.json were emptied, every parity check below
  // would pass vacuously.
  expect(referenceKeys.length).toBeGreaterThan(0);
});

// Data-driven over `routing.locales`, so a locale added later is covered with
// no edit to this file. For `en` the parity check compares the reference with
// itself and is trivially true — it starts earning its keep the moment a
// second locale file exists. The empty-value and ICU checks bite today.
describe.each(routing.locales)("messages/%s.json", (locale) => {
  const messages = flatten(loadMessages(locale));

  test("has exactly the same keys as the reference locale", () => {
    // Sorted comparison in both directions at once: a missing key and an
    // orphaned key both show up as an array mismatch.
    expect(Object.keys(messages).sort()).toEqual(referenceKeys);
  });

  test("has no empty or whitespace-only values", () => {
    const blank = Object.keys(messages).filter(
      (key) => messages[key].trim() === "",
    );

    expect(blank).toEqual([]);
  });

  test.each(Object.keys(reference))("%s is valid ICU", (key) => {
    // The IntlMessageFormat constructor parses eagerly, so a malformed
    // placeholder or an unbalanced plural arm throws here.
    expect(() => new IntlMessageFormat(messages[key], locale)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS — 2 test files. The `messages` file contributes 1 + 3 + (one ICU
test per message key) tests.

- [ ] **Step 4: Prove the ICU check bites**

In `messages/en.json`, temporarily break the plural in `home.gradedCount` by
deleting the closing brace of the `other` arm, so the value reads:

```json
    "gradedCount": "{count, plural, =0 {No cards graded yet} one {# card graded} other {# cards graded}"
```

Run: `npm test`
Expected: FAIL — `messages/en.json > home.gradedCount is valid ICU` throws a
parse error.

- [ ] **Step 5: Prove the empty-value check bites**

Revert `home.gradedCount`. Now temporarily set `common.loading` to `""`.

Run: `npm test`
Expected: FAIL — `has no empty or whitespace-only values` reports
`["common.loading"]` against an expected `[]`.

Revert `messages/en.json` fully and re-run `npm test`.
Expected: PASS.

- [ ] **Step 6: Verify lint and types are clean**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: succeeds. (`.next/types/` already exists from Task 1's build; no
rebuild needed unless the working tree was cleaned.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json messages/messages.test.ts
git commit -m "test: verify message file key parity and ICU validity

messages.d-check.ts is a compile-time shape check; a malformed ICU string
is a valid TypeScript string and only fails when rendered. This asserts
every message parses, is non-empty, and that every locale carries exactly
the reference key set.

Data-driven over routing.locales, so future locales are covered with no
edit to the test."
```

---

## Task 3: Component test infrastructure + home page

The `renderWithIntl` helper is the piece M1 leans on for every component test,
so it ships together with the first consumer that proves it works.

**Files:**
- Create: `test/i18n.tsx`
- Create: `app/[locale]/page.test.tsx`

**Interfaces:**
- Consumes: `test/setup.ts` from Task 1 (jest-dom matchers, RTL cleanup).
- Produces:
  - `renderWithIntl(ui: ReactElement, options?: { locale?: Locale } & Omit<RenderOptions, "wrapper">): RenderResult`
  - re-exports `screen` and `within` from `@testing-library/react`

  Every component test in M1 onwards imports from `@/test/i18n`, not from
  `@testing-library/react` directly.

- [ ] **Step 1: Write the render helper**

Create `test/i18n.tsx`:

```tsx
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import { type Locale, NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { routing } from "@/i18n/routing";
import messages from "@/messages/en.json";

export { screen, within } from "@testing-library/react";

type RenderWithIntlOptions = Omit<RenderOptions, "wrapper"> & {
  locale?: Locale;
};

/**
 * Renders a component inside `NextIntlClientProvider` with the REAL messages
 * from `messages/en.json`, never a stub.
 *
 * Real messages mean a test breaks when a key is deleted or renamed, and that
 * assertions are written against resolved output instead of copy duplicated
 * into the test file — the same rule CLAUDE.md puts on components.
 *
 * Server config from `i18n/request.ts` is unavailable here, so `locale` and
 * `messages` must be passed to the provider explicitly.
 */
export function renderWithIntl(
  ui: ReactElement,
  { locale = routing.defaultLocale, ...options }: RenderWithIntlOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
```

- [ ] **Step 2: Write the home page test**

Create `app/[locale]/page.test.tsx`:

```tsx
import { expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import Home from "./page";

// `page.tsx` is a SYNCHRONOUS Server Component, so RTL renders it directly.
// `layout.tsx` is async and cannot be tested this way — that gap belongs to
// E2E in M8. Do not try to make an async Server Component render here.

test("renders the headline from the message file", () => {
  renderWithIntl(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: messages.home.title }),
  ).toBeInTheDocument();
});

test("renders the subtitle", () => {
  renderWithIntl(<Home />);

  expect(screen.getByText(messages.home.subtitle)).toBeInTheDocument();
});

test("links both calls to action to their destinations", () => {
  renderWithIntl(<Home />);

  expect(
    screen.getByRole("link", { name: messages.home.ctaPrimary }),
  ).toHaveAttribute("href", "/submit");

  expect(
    screen.getByRole("link", { name: messages.home.ctaSecondary }),
  ).toHaveAttribute("href", "/how-it-works");
});
```

The `href` assertions are the ones that matter most: they prove the `Link` from
`@/i18n/navigation` emits an unprefixed English URL. Importing `Link` from
`next/link` instead — the mistake CLAUDE.md warns against — would still render
an anchor, so only the resolved `href` catches it once a second locale exists.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS — 3 test files, all green.

If Vitest reports that it collected only 2 test files, the `[locale]` brackets
in the directory name are being read as a glob character class during file
discovery. Fix it by adding `dir: "."` and keeping the include pattern as-is,
or by escaping the path — do **not** move the test out of `app/[locale]/`, and
do not abandon the colocation convention over it.

- [ ] **Step 4: Prove the tests bite**

In `app/[locale]/page.tsx`, temporarily change the primary CTA's
`href="/submit"` to `href="/submitt"`.

Run: `npm test`
Expected: FAIL — `links both calls to action to their destinations` reports the
received `href` as `"/submitt"`.

Revert that. Now temporarily change `t("title")` in the `<h1>` to
`t("subtitle")`.

Run: `npm test`
Expected: FAIL — `renders the headline from the message file` cannot find a
level-1 heading with the expected accessible name.

Revert `app/[locale]/page.tsx` fully and re-run `npm test`.
Expected: PASS.

- [ ] **Step 5: Verify lint and types are clean**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed. This is the run that proves the jest-dom matcher types
(`toBeInTheDocument`, `toHaveAttribute`) resolve through the
`@testing-library/jest-dom/vitest` import in `test/setup.ts`, with no
`tsconfig.json` change.

- [ ] **Step 6: Commit**

```bash
git add test/i18n.tsx "app/[locale]/page.test.tsx"
git commit -m "test: add renderWithIntl helper and home page component test

renderWithIntl wraps components in NextIntlClientProvider with the real
en.json, so deleting a message key breaks the tests that use it and no
user-facing copy is duplicated into assertions.

The href assertions pin the Link import from @/i18n/navigation — the rule
that keeps English URLs unprefixed."
```

---

## Task 4: Coverage, CI, and documented conventions

Makes the suite part of the build and writes down the conventions, so the next
person adding a test does not have to reverse-engineer them from three examples.

**Files:**
- Modify: `package.json` (add `@vitest/coverage-v8`)
- Modify: `vitest.config.mts` (coverage block)
- Modify: `.dockerignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the full suite from Tasks 1–3.
- Produces: `npm run test:coverage`; a `Test` step in CI.

- [ ] **Step 1: Install the coverage provider**

```bash
npm install -D @vitest/coverage-v8@^4.1
```

The version must track `vitest` itself — a mismatched major fails at startup.

- [ ] **Step 2: Add the coverage block to the Vitest config**

In `vitest.config.mts`, add a `coverage` key inside `test`, immediately after
the `exclude` line:

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // `components` and `lib` do not exist yet; declared now so M1 code is
      // measured the moment it lands.
      include: ["app/**", "components/**", "i18n/**", "lib/**"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      // No thresholds. With this few source files any number is arbitrary and
      // would get moved for the wrong reasons. Revisit when M3 and M5 land
      // real business logic.
    },
```

- [ ] **Step 3: Verify coverage runs**

Run: `npm run test:coverage`
Expected: all tests pass, a coverage table prints, and `coverage/` is created
containing `index.html` and `lcov.info`. No threshold error.

Run: `git status --short`
Expected: `coverage/` does **not** appear — `.gitignore` already lists
`/coverage`.

- [ ] **Step 4: Keep test files out of the production image**

In `.dockerignore`, find the existing `# Tooling caches` block:

```
# Tooling caches
.eslintcache
coverage
playwright-report
test-results
```

Insert a new block immediately **before** it:

```
# Tests — never needed to build the app, and never shipped in the image
**/*.test.ts
**/*.test.tsx
test
vitest.config.mts
```

`coverage` is already covered by the block below, so do not add it again.

- [ ] **Step 5: Add the CI step**

In `.github/workflows/ci.yml`, insert a `Test` step between the existing `Lint`
step and the `# Build MUST run before the type check.` comment:

```yaml
      - name: Lint
        run: npm run lint

      # Runs before the build on purpose: the unit suite needs no .next/ and
      # finishes in seconds, so a failure here saves the ~2-minute build.
      - name: Test
        run: npm test

      # Build MUST run before the type check. Next 16 generates types into
```

Do not rename the job. Do not add coverage to CI — it is a local tool until
there are thresholds worth enforcing.

- [ ] **Step 6: Document the conventions**

In `CLAUDE.md`, insert this section immediately **before** the
`## Git Workflow & CI/CD` heading:

````markdown
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
  on line 1. When there is enough server code to warrant it (M7 webhooks),
  promote this to `test.projects`.
- **Async Server Components cannot be unit-tested** — Vitest does not support
  them, and neither `app/[locale]/layout.tsx` nor multi-step flows nor
  `proxy.ts` locale negotiation are covered here. That is E2E's job in M8.
  Don't lose an afternoon fighting Vitest over `layout.tsx`.
- **Coverage is reported, not gated.** No thresholds until M3/M5 land real
  business logic.
````

- [ ] **Step 7: Full verification from a clean state**

```bash
rm -rf .next coverage
npm test
npm run lint
npm run build && npx tsc --noEmit
npm run test:coverage
```

Expected: every command exits 0. `npm test` reports 3 test files, all passing.

- [ ] **Step 8: Verify the Docker build still works**

Run: `docker build -t artsgrading-test .`
Expected: succeeds. This confirms the `.dockerignore` additions did not remove
anything the build needs. If Docker is unavailable on this machine, skip it and
say so explicitly rather than reporting the step as done.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.mts .dockerignore \
  .github/workflows/ci.yml CLAUDE.md
git commit -m "ci: run the test suite, add coverage reporting, document conventions

Tests run before the build in the existing lint-build-typecheck job: they
need no .next/ and fail in seconds, so a failure saves the build. Job name
is unchanged because it may be a required status check.

Coverage reports but does not gate — with this few source files a threshold
would be arbitrary. Test files are excluded from the Docker context so
nothing test-related reaches the production image."
```

---

## Done when

All five of these hold from a clean checkout:

1. `npm test` — 3 test files, all green
2. `npm run test:coverage` — report generated, no threshold error
3. `npm run lint` — clean, including the new test files
4. `npm run build && npx tsc --noEmit` — clean, test files type-check
5. Each task's "prove the test bites" step was actually run and observed red

## Deliberately not built

Recorded in the spec, repeated here so they are not mistaken for oversights:

- `app/api/health/route.ts` — untested by choice. It is the contract Coolify's
  healthcheck polls and `docs/deployment/ROLLBACK.md` verifies against. Worth
  adding before the M8 launch gate.
- `app/[locale]/layout.tsx` — async Server Component, E2E in M8.
- `proxy.ts` locale negotiation — integration-shaped, E2E in M8.
- Playwright — M8.
- Coverage thresholds — revisit at M3/M5.
