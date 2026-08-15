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
 * The single audited exception. WCAG 1.4.3 exempts text that is part of a logo
 * or brand name, and the wordmark's gold full stop is a brand mark carrying no
 * information. Keeping the allowlist to one path is the point — if a second
 * file needs to be added here, that is a design decision, not a formality.
 */
const LOGOTYPE_ALLOWLIST = ["components/layout/wordmark.tsx"];

/**
 * Blanks out comments so prose *about* the rule is not mistaken for a
 * violation of it. Replaces with spaces rather than deleting, to keep byte
 * offsets — and therefore reported line numbers — accurate.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

describe("gold token discipline", () => {
  test("no component uses text-gold as a text colour", () => {
    // `--gold` measures 3.13:1 on the light surface and fails WCAG AA for
    // text. `text-gold-ink` is the accessible one. `bg-gold`, `border-gold`
    // and `border-gold-line` are fine — the rule is about text only.
    const offenders: string[] = [];

    for (const file of [...walk("app"), ...walk("components")]) {
      if (LOGOTYPE_ALLOWLIST.includes(file)) continue;

      const source = stripComments(readFileSync(file, "utf8"));
      // Matches `text-gold` but not `text-gold-ink` / `text-gold-bright`.
      // The `(?!-)` is load-bearing: `\b` treats a hyphen as a word boundary,
      // so a bare /\btext-gold\b/ matches inside `text-gold-ink` too.
      for (const match of source.matchAll(/\btext-gold\b(?!-)/g)) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the allowlisted files still exist", () => {
    // A stale allowlist entry silently widens the exception when a file is
    // renamed: the guard skips a path that no longer exists while the real
    // one goes unchecked.
    const all = [...walk("app"), ...walk("components")];
    for (const allowed of LOGOTYPE_ALLOWLIST) {
      expect(all).toContain(allowed);
    }
  });
});
