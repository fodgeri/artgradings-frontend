// @vitest-environment node
import { describe, expect, test } from "vitest";

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordProblem } from "./password";

describe("passwordProblem", () => {
  test("rejects a password one character short", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("passwordTooShort");
  });

  test("accepts a password at the minimum", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  test("counts characters, not UTF-16 units, for the minimum", () => {
    // Ten emoji are ten characters but twenty UTF-16 units.
    expect(passwordProblem("😀".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordProblem("😀".repeat(PASSWORD_MIN_LENGTH - 1))).toBe("passwordTooShort");
  });

  test("accepts exactly 72 bytes of multibyte text", () => {
    // "é" is two bytes in UTF-8: 36 of them are 72 bytes.
    expect(passwordProblem("é".repeat(PASSWORD_MAX_BYTES / 2))).toBeNull();
  });

  test("rejects 73 bytes, because bcrypt would silently truncate", () => {
    expect(passwordProblem(`${"é".repeat(PASSWORD_MAX_BYTES / 2)}a`)).toBe("passwordTooLong");
  });
});
