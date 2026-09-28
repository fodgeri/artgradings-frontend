// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import { describe, expect, test } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

const ADMIN_MODULE = join("lib", "supabase", "admin");

/**
 * Every module specifier in `source`: static imports and re-exports
 * (`from "…"`), side-effect imports (`import "…"`), dynamic `import("…")` and
 * `require("…")`.
 */
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;
  return Array.from(source.matchAll(pattern), (match) => match[1]);
}

/**
 * Whether `file` (a repo-relative path) imports the admin client, by any
 * spelling: an alias whose path ends in `supabase/admin`, or a relative path
 * that resolves to lib/supabase/admin from where `file` sits.
 */
function importsAdminClient(file: string, source: string): boolean {
  return specifiers(source).some((specifier) => {
    const bare = specifier.replace(/\.(?:ts|tsx|js|mjs|cjs)$/, "").replace(/\/$/, "");
    if (bare.startsWith(".")) return normalize(join(dirname(file), bare)) === ADMIN_MODULE;
    return /(?:^|\/)supabase\/admin$/.test(bare);
  });
}

describe("importsAdminClient", () => {
  const FILE = join("app", "[locale]", "x", "actions.ts");
  const SIBLING = join("lib", "supabase", "server.ts");
  const NEIGHBOUR = join("lib", "auth", "thing.ts");

  test.each([
    [FILE, 'import { createAdminClient } from "@/lib/supabase/admin";'],
    [FILE, "import {\n  createAdminClient,\n} from '@/lib/supabase/admin';"],
    [FILE, 'export { createAdminClient } from "@/lib/supabase/admin";'],
    [FILE, 'const { createAdminClient } = await import("@/lib/supabase/admin");'],
    [FILE, "const mod = await import( '@/lib/supabase/admin.ts' );"],
    [FILE, 'import "@/lib/supabase/admin";'],
    [FILE, 'const m = require("@/lib/supabase/admin");'],
    [FILE, 'import { x } from "../../../lib/supabase/admin";'],
    [SIBLING, 'import { createAdminClient } from "./admin";'],
    [SIBLING, 'await import("./admin.ts");'],
    [NEIGHBOUR, 'import { createAdminClient } from "../supabase/admin";'],
  ])("%s importing via %j is caught", (file, source) => {
    expect(importsAdminClient(file, source)).toBe(true);
  });

  test.each([
    [FILE, 'import { createClient } from "@/lib/supabase/server";'],
    [FILE, 'import { adminThing } from "./admin";'],
    [NEIGHBOUR, 'import { x } from "./admin";'],
    [FILE, 'import { x } from "@/lib/supabase/administrator";'],
    [FILE, "// the admin client lives in lib/supabase/admin"],
  ])("%s importing via %j is not", (file, source) => {
    expect(importsAdminClient(file, source)).toBe(false);
  });
});

/**
 * Files permitted to import the service_role client. `server-only` already
 * makes a Client Component importing it a build error; this guard is the
 * second lock, and it catches the case `server-only` cannot — a Server
 * Component reaching for RLS-bypassing credentials because it was convenient.
 *
 * Adding a path here is a security decision, not a formality.
 */
const ADMIN_ALLOWLIST: string[] = [join("lib", "auth", "delete-current-user.ts")];

describe("service_role client containment", () => {
  test("the client this guard protects exists", () => {
    // Without this the guard passes vacuously before admin.ts is written, and
    // would keep passing if the file were ever deleted or renamed.
    expect(walk("lib")).toContain(join("lib", "supabase", "admin.ts"));
  });

  test("the allowlist is exactly the account-deletion module", () => {
    // Widening this is a security decision; the test makes it a visible one.
    expect(ADMIN_ALLOWLIST).toEqual([join("lib", "auth", "delete-current-user.ts")]);
  });

  test("the matcher recognises the allowlisted module's real import", () => {
    // Proves the matcher on real source, not only the samples above: were it
    // to stop matching, the guard below would pass vacuously.
    for (const allowed of ADMIN_ALLOWLIST) {
      expect(importsAdminClient(allowed, readFileSync(allowed, "utf8"))).toBe(true);
    }
  });

  test("nothing outside the allowlist imports the admin client", () => {
    const offenders: string[] = [];

    for (const file of [...walk("app"), ...walk("components"), ...walk("lib")]) {
      if (ADMIN_ALLOWLIST.includes(file)) continue;
      if (file === join("lib", "supabase", "admin.ts")) continue;

      if (importsAdminClient(file, readFileSync(file, "utf8"))) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  test("the allowlisted files still exist", () => {
    // A stale entry silently widens the exception: the guard skips a path that
    // no longer exists while the real one goes unchecked.
    const all = [...walk("app"), ...walk("components"), ...walk("lib")];
    for (const allowed of ADMIN_ALLOWLIST) {
      expect(all).toContain(allowed);
    }
  });
});
