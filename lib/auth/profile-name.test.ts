// @vitest-environment node
import { describe, expect, test } from "vitest";

import { NAME_MAX_LENGTH, nameTooLong, normalizeName } from "./profile-name";

describe("normalizeName", () => {
  test("trims surrounding whitespace", () => {
    expect(normalizeName("  Ada \t")).toBe("Ada");
  });

  test("keeps inner spaces", () => {
    expect(normalizeName("Mary Ann")).toBe("Mary Ann");
  });

  test.each(["", "   ", "\n\t "])("turns %j into null", (raw) => {
    expect(normalizeName(raw)).toBeNull();
  });
});

describe("nameTooLong", () => {
  test("the limit is 100, mirroring the database check", () => {
    expect(NAME_MAX_LENGTH).toBe(100);
  });

  test("null is never too long", () => {
    expect(nameTooLong(null)).toBe(false);
  });

  test("accepts exactly the limit and rejects one more", () => {
    expect(nameTooLong("a".repeat(100))).toBe(false);
    expect(nameTooLong("a".repeat(101))).toBe(true);
  });

  test("counts an astral character as one, as Postgres char_length does", () => {
    // "𝒜" is two UTF-16 code units; String.length would count 200.
    expect(nameTooLong("𝒜".repeat(100))).toBe(false);
  });
});
