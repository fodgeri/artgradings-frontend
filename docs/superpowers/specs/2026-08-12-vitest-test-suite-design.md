# Vitest test suite — initial setup

**Date:** 2026-08-12
**Status:** Approved, not yet implemented
**Module:** M0 — Foundation & infra

## Goal

Stand up the unit and component testing harness for the frontend, plus a small
set of seed tests that establish the patterns M1–M7 will copy. The deliverable
is the harness and its conventions, not coverage of the current (near-empty)
codebase.

## Non-goals

- **E2E / Playwright.** Deferred to M8, where the estimate already budgets it.
  At M0 there is no multi-step flow to walk through, so an E2E harness would sit
  empty and slow CI. This is also where async Server Components get covered —
  see "Known gaps".
- **Coverage thresholds.** With five source files any percentage is arbitrary,
  and a gate set now would be raised or lowered for the wrong reasons. Revisit
  when M3 (submission flow) and M5 (grading workflow) land real business logic.
- **Testing `app/[locale]/layout.tsx`.** It is an `async` Server Component;
  Vitest structurally cannot render those.

## Stack

| Package | Version | Role |
|---|---|---|
| `vitest` | ^4.1 | runner |
| `@vitejs/plugin-react` | ^6.0 | JSX transform |
| `jsdom` | ^30.0 | DOM environment |
| `@testing-library/react` | ^16.3 | component rendering (React 19 compatible) |
| `@testing-library/dom` | ^10.4 | RTL peer dependency |
| `@testing-library/jest-dom` | ^7.0 | DOM matchers |
| `@vitest/coverage-v8` | ^4.1 | coverage |
| `intl-messageformat` | latest | ICU validation in the message integrity test |

All devDependencies. `intl-messageformat` is already present transitively via
`next-intl`, but is declared explicitly rather than imported by accident from
another package's dependency tree.

## Architecture

### Single jsdom environment

`vitest.config.mts` at the repo root:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    globals: false,
    exclude: ["**/node_modules/**", "**/.next/**"],
    coverage: { /* see below */ },
    server: { deps: { inline: ["next-intl"] } },
  },
});
```

This is Next.js's documented configuration plus a setup file. One environment
for everything.

Two departures from what Next's docs show, both forced by evidence during
implementation:

- **No `vite-tsconfig-paths`.** Vite resolves `tsconfig` path aliases natively
  as of v7 via `resolve.tsconfigPaths`, and Vitest emits a warning when the
  plugin is present. Dropping it also drops the deprecated `tsconfck`
  transitive dependency.
- **`next-intl` is inlined.** Its ESM build does
  `import {useRouter} from "next/navigation"`, and the `next` package ships **no
  `exports` map**. Vitest externalizes `node_modules` by default, so that file
  is loaded by native Node ESM — which, absent an `exports` map, resolves
  `next/navigation` to a literal path and throws `ERR_MODULE_NOT_FOUND`
  ("Did you mean next/navigation.js?"). Bundlers do extensionless resolution
  and find `navigation.js`; Node does not. Inlining routes the file through
  Vite's resolver. Any future dependency that imports `next/*` internally will
  need the same treatment.

**Rejected: splitting node and jsdom into two `test.projects`.** Multi-project
configs are standard in monorepos; within a single package the documented
mechanism for per-file environments is a `// @vitest-environment node` docblock.
More importantly it buys nothing today — the two node-flavoured seed tests run
identically under jsdom, and jsdom's startup cost across two files is
negligible. The real case for a node project arrives with M7's Stripe webhook
handlers, at which point promoting to `projects` is an additive change.

**Escape hatch:** a test that genuinely needs the node environment declares
`// @vitest-environment node` at the top of the file.

### `globals: false`

Tests import their primitives explicitly:

```ts
import { describe, expect, test } from "vitest";
```

This is Vitest's default and matches Next's documented example. It keeps
`tsc --noEmit` honest with no ambient `vitest/globals` types entry in
`tsconfig.json`. The cost: RTL cannot auto-register its cleanup hook, so
`test/setup.ts` does it explicitly.

### Test placement — colocated

`i18n/routing.test.ts` sits beside `i18n/routing.ts`. Tests move, rename and
delete with their source; a missing test is visible in the same directory
listing.

```
app/
  [locale]/
    page.tsx
    page.test.tsx
  api/health/
    route.ts
i18n/
  routing.ts
  routing.test.ts
messages/
  en.json
  messages.test.ts
test/
  setup.ts
  i18n.tsx
```

Colocating inside `app/` is safe: the App Router only treats reserved filenames
(`page`, `route`, `layout`, `template`, `default`, `error`, `loading`,
`not-found`) as routes, so `page.test.tsx` is inert. The files are still
excluded from the Docker build context so nothing test-related reaches the
production image.

## Shared test infrastructure

Two files, and the part that actually pays off across M1–M7.

### `test/setup.ts`

Registers the jest-dom matchers and RTL cleanup:

```ts
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
```

The `afterEach` is required, not decorative — with `globals: false`, RTL has no
global hook to attach to and leaks DOM between tests without it.

### `test/i18n.tsx`

```ts
renderWithIntl(ui: ReactElement, options?: { locale?: Locale })
```

Wraps the tree in `NextIntlClientProvider` with the **real** `messages/en.json`,
not a stub, and re-exports RTL's `screen` and `within` so a component test needs
one import. This is next-intl's documented testing approach.

Using real messages is deliberate: a test breaks when a key is deleted, and
assertions read against resolved output rather than copy duplicated into the
test file. That is the same rule CLAUDE.md already puts on components — no
hardcoded user-facing strings.

## Seed tests

Three, each demonstrating a different technique so future tests have a pattern
to copy.

### `i18n/routing.test.ts` — config invariants

- `defaultLocale` is a member of `locales`
- `localePrefix` is `"as-needed"`
- `getPathname` produces an unprefixed path for the default locale (`/faq`) and
  a prefixed one for any other locale

Pins the canonical-URL guarantee CLAUDE.md commits to. Turns "adding a language
never changes an English URL" from a comment into an executable assertion.

### `messages/messages.test.ts` — message file integrity

Data-driven over `routing.locales`, so locales added later are covered with zero
edits to the test:

- every locale file's key set matches `en.json` exactly, checked in both
  directions on flattened dot-paths (catches both missing and orphaned keys)
- every leaf value is a non-empty string
- every value parses as ICU via `new IntlMessageFormat(value, locale)`

This catches what `i18n/messages.d-check.ts` structurally cannot. That file is a
compile-time *shape* check; a malformed ICU string such as a broken `plural` arm
is a perfectly valid `string` to TypeScript and only fails when rendered. The
`home.gradedCount` plural is exactly this shape.

### `app/[locale]/page.test.tsx` — component rendering

Renders `<Home />` through `renderWithIntl` and asserts:

- the `h1` by accessible role, against the resolved `home.title`
- both CTAs by role `link`, with their `href`s (`/submit`, `/how-it-works`)

`page.tsx` is a *synchronous* Server Component, so RTL renders it directly. It
exercises the `Link` from `@/i18n/navigation`, which is the import rule most
likely to be violated by future work.

## Wiring

### Scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

`test` is single-shot. Vitest already disables watch under `CI=true`, but a
default that can never hang is worth more than matching Next's documented script
— `npm test` is run by CI, by scripts, and by agents far more often than by a
human wanting a watch loop.

### CI

One step added to the existing `lint-build-typecheck` job in
`.github/workflows/ci.yml`, **after Lint and before Build**:

```yaml
- name: Test
  run: npm test
```

Tests need no `.next/` directory and run in seconds, so failing here saves the
~2-minute build. The job id stays `lint-build-typecheck` — renaming it would
break any required status check configured on branch protection.

### Coverage

`@vitest/coverage-v8`, reporters `text` + `html` + `lcov`, scoped to `app/**`,
`i18n/**`, and the future `lib/**` and `components/**`. Test files, `test/`,
config files and `messages/**` are excluded from the report. **No thresholds.**

### Ignores

- `.gitignore` — add `coverage/`
- `.dockerignore` — add `**/*.test.ts`, `**/*.test.tsx`, `test/`,
  `vitest.config.mts`, `coverage/`

### Type checking

Test files are picked up by the existing `**/*.ts` / `**/*.tsx` include in
`tsconfig.json`, so `npx tsc --noEmit` in CI type-checks them alongside the app.
The jest-dom matcher types reach test files through the
`@testing-library/jest-dom/vitest` import in `test/setup.ts`, which the same
include covers. No `tsconfig.json` change is needed.

### Documentation

A `## Testing` section in `CLAUDE.md` covering: the colocation convention, the
single jsdom environment and its `// @vitest-environment node` escape hatch,
`renderWithIntl` as the entry point for every component test, and the standing
note that async Server Components and multi-step flows belong to E2E in M8 — so
nobody loses an afternoon fighting Vitest over `layout.tsx`.

## Known gaps

Recorded deliberately, not overlooked:

- **`app/api/health/route.ts` is untested.** It is the contract Coolify's
  healthcheck polls and the one `docs/deployment/ROLLBACK.md` uses to verify
  which bytes are live (`curl .../api/health | jq .sha`). A test calling `GET()`
  directly would pin the response shape and the `sha` fallback to `"unknown"`.
  Excluded from this pass by choice; worth adding before the M8 launch gate.
- **`app/[locale]/layout.tsx` is untested** — async Server Component, covered by
  E2E in M8.
- **`proxy.ts` locale negotiation is untested.** The matcher regex and the
  cookie/`Accept-Language` resolution order are integration-shaped; they belong
  to E2E in M8 rather than to a unit test that would mostly re-assert the regex.

## Verification

Implementation is complete when all of the following pass from a clean checkout:

1. `npm test` — 3 test files, all green
2. `npm run test:coverage` — produces a report without error
3. `npm run lint` — clean, including the new test files
4. `npm run build && npx tsc --noEmit` — clean, test files type-check
5. A deliberately broken ICU string in `messages/en.json` fails
   `messages.test.ts` (proves the integrity test actually bites)
