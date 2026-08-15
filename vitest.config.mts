import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves `@/*` in tests exactly as the app resolves it, so a test
    // imports a module by the same specifier the app uses. Vite supports this
    // natively as of v7 — the `vite-tsconfig-paths` plugin that Next's docs
    // still recommend is redundant here, and Vitest warns when it is present.
    tsconfigPaths: true,
  },
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
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Restricted to source extensions — a bare `app/**` also drags
      // favicon.ico and globals.css into the denominator. `components` and
      // `lib` do not exist yet; declared now so M1 code is measured the
      // moment it lands.
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "i18n/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
      // No thresholds. With this few source files any number is arbitrary and
      // would get moved for the wrong reasons. Revisit when M3 and M5 land
      // real business logic.
    },
    server: {
      deps: {
        // `next-intl` must be transformed by Vite rather than loaded natively
        // by Node. Its ESM build does `import ... from "next/navigation"`, and
        // the `next` package ships no `exports` map — so native Node ESM
        // resolves that to a literal path and fails, while Vite's resolver
        // finds `next/navigation.js` the same way webpack and turbopack do.
        inline: ["next-intl"],
      },
    },
  },
});
