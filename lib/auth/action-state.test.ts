// @vitest-environment node
import { describe, expect, test } from "vitest";

import { formData } from "@/test/form-data";

import { readEmail, readField, resolveLocale } from "./action-state";

describe("readField", () => {
  test("returns a string field", () => {
    expect(readField(formData({ password: "secret" }), "password")).toBe("secret");
  });

  test("returns an empty string for a missing field", () => {
    expect(readField(formData({}), "password")).toBe("");
  });

  test("returns an empty string for a file where a string was expected", () => {
    const data = new FormData();
    data.set("password", new Blob(["x"]), "x.txt");
    expect(readField(data, "password")).toBe("");
  });
});

describe("readEmail", () => {
  test("trims surrounding whitespace", () => {
    expect(readEmail(formData({ email: "  user@example.test \n" }))).toBe("user@example.test");
  });

  test.each(["", "user", "user@", "user@example", "a b@example.test"])(
    "rejects %j",
    (email) => {
      expect(readEmail(formData({ email }))).toBeNull();
    },
  );
});

describe("resolveLocale", () => {
  test("keeps a supported locale", () => {
    expect(resolveLocale("en")).toBe("en");
  });

  test("falls back to the default for anything else", () => {
    // The bound locale comes from the browser and can be anything.
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});
