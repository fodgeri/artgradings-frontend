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
