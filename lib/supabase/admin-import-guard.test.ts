// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : [];
  });
}

/**
 * Files permitted to import the service_role client. `server-only` already
 * makes a Client Component importing it a build error; this guard is the
 * second lock, and it catches the case `server-only` cannot — a Server
 * Component reaching for RLS-bypassing credentials because it was convenient.
 *
 * Adding a path here is a security decision, not a formality.
 */
const ADMIN_ALLOWLIST: string[] = [];

describe("service_role client containment", () => {
  test("the client this guard protects exists", () => {
    // Without this the guard passes vacuously before admin.ts is written, and
    // would keep passing if the file were ever deleted or renamed.
    expect(walk("lib")).toContain(join("lib", "supabase", "admin.ts"));
  });

  test("nothing outside the allowlist imports the admin client", () => {
    const offenders: string[] = [];

    for (const file of [...walk("app"), ...walk("components"), ...walk("lib")]) {
      if (ADMIN_ALLOWLIST.includes(file)) continue;
      if (file === join("lib", "supabase", "admin.ts")) continue;

      const source = readFileSync(file, "utf8");
      if (/from\s+["'](@\/lib\/supabase\/admin|\.\/admin)["']/.test(source)) {
        offenders.push(file);
      }
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
