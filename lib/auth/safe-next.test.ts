// @vitest-environment node
import { describe, expect, test } from "vitest";

import { DEFAULT_NEXT, safeNext } from "./safe-next";

describe("safeNext", () => {
  test.each(["/account", "/submit?x=1", "/account#orders", "/a/b/c"])(
    "accepts the same-origin path %s",
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  test.each([
    ["protocol-relative", "//evil.test"],
    ["backslash protocol-relative", "/\\evil.test"],
    ["absolute URL", "https://evil.test"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative path", "account"],
    ["empty string", ""],
    // Browsers strip tab and newline from URLs before parsing, so each of
    // these becomes `//evil.test` in the address bar.
    ["tab before the second slash", "/\t/evil.test"],
    ["newline before the second slash", "/\n/evil.test"],
    ["backslash later in the path", "/ok\\..\\evil"],
  ])("rejects a %s", (_label, value) => {
    expect(safeNext(value)).toBe(DEFAULT_NEXT);
  });

  test.each([undefined, null, 42, ["/account"], { href: "/account" }])(
    "rejects the non-string %j",
    (value) => {
      expect(safeNext(value)).toBe(DEFAULT_NEXT);
    },
  );
});
