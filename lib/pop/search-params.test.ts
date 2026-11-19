import { describe, expect, test } from "vitest";
import {
  isEmptySearch,
  parsePopSearch,
  toMeiliFilter,
  toSearchParams,
  type PopSearch,
} from "./search-params";

describe("parsePopSearch", () => {
  test("rejects injected category", () => {
    expect(parsePopSearch({ category: 'pokemon" OR kind = "x' }).category).toBeUndefined();
  });
  test("rejects injected grade and kind", () => {
    expect(parsePopSearch({ grade: "';drop" }).grade).toBeUndefined();
    expect(parsePopSearch({ kind: 'tcg" OR 1' }).kind).toBeUndefined();
  });
  test("cuts q to 100", () => {
    expect(parsePopSearch({ q: "a".repeat(5000) }).q).toHaveLength(100);
    expect(parsePopSearch({ q: "  hi  " }).q).toBe("hi");
  });
  test("first of repeated values", () => {
    expect(parsePopSearch({ category: ["mtg", "pokemon"] }).category).toBe("mtg");
  });
  test("year must be an integer 1880-2100", () => {
    for (const year of ["1999.5", "0", "abc", "1879", "2101", "-1999", "1e3"]) {
      expect(parsePopSearch({ year }).year).toBeUndefined();
    }
    expect(parsePopSearch({ year: "1999" }).year).toBe(1999);
  });
  test("page defaults to 1 and is bounded", () => {
    expect(parsePopSearch({ page: "-3" }).page).toBe(1);
    expect(parsePopSearch({ page: "101" }).page).toBe(1);
    expect(parsePopSearch({ page: "7" }).page).toBe(7);
  });
  test("accepts authentic grade", () => {
    expect(parsePopSearch({ grade: "authentic" }).grade).toBe("authentic");
  });
});

describe("toMeiliFilter", () => {
  const s: PopSearch = {
    q: "x", kind: "tcg", category: "pokemon", year: 1999, grade: "g10", page: 1,
  };
  test("exact filters", () => {
    expect(toMeiliFilter(s)).toEqual([
      'kind = "tcg"',
      'category = "pokemon"',
      "release_year = 1999",
      'grades_present = "g10"',
    ]);
    expect(toMeiliFilter({ q: "", page: 1 })).toEqual([]);
  });
  test("round-trips through URL params", () => {
    const full = { ...s, page: 3 };
    expect(parsePopSearch(Object.fromEntries(toSearchParams(full)))).toEqual(full);
    expect(toSearchParams({ q: "", page: 1 }).toString()).toBe("");
  });
});

test("isEmptySearch", () => {
  expect(isEmptySearch({ q: "", page: 4 })).toBe(true);
  expect(isEmptySearch({ q: "", year: 2000, page: 1 })).toBe(false);
  expect(isEmptySearch({ q: "a", page: 1 })).toBe(false);
});
