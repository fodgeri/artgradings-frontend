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

/**
 * Maps every `--ag-*` declaration in a block to its value.
 *
 * Internal whitespace is collapsed because the two dark blocks sit at
 * different nesting depths, so a wrapped multi-line shadow value carries two
 * extra spaces of indentation in the media-query copy. CSS does not care, and
 * neither should the comparison — otherwise the test fails on indentation
 * while the stylesheet is correct.
 */
function tokens(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of body.matchAll(/(--ag-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(m[1], m[2].replace(/\s+/g, " ").trim());
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
