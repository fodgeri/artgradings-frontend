import { describe, expect, test } from "vitest";

import { normaliseCertNumber } from "./cert-number";

describe("normaliseCertNumber", () => {
  test.each([
    [" #art-0883 1204 ", "ART-08831204"],
    ["ART-08831204", "ART-08831204"],
    ["art-08831204", "ART-08831204"],
    ["\tART-0883\n1204", "ART-08831204"],
  ])("normalises %j", (input, expected) => {
    expect(normaliseCertNumber(input)).toBe(expected);
  });

  test.each(["../etc", "", "   ", "x".repeat(500), "AB", "ART_0883", "ART/0883", "ART-0883%20", "ÄRT-0883"])(
    "rejects %j",
    (input) => {
      expect(normaliseCertNumber(input)).toBeNull();
    },
  );
});
