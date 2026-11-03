import { describe, expect, test } from "vitest";

import { DECLARED_VALUE_MAX_CENTS } from "@/lib/orders/card-rules";

import { DEFAULT_CURRENCY, parseMoney } from "./money";

describe("parseMoney", () => {
  test.each([
    ["400", 40000],
    ["400.5", 40050],
    ["400,5", 40050],
    ["400.50", 40050],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["€ 400", 40000],
    ["$400", 40000],
    ["  400 ", 40000],
    ["1,234", 123400],
    ["1.234", 123400],
    ["1,234,567", 123456700],
    ["1.234.567", 123456700],
    ["1.234.567,89", 123456789],
    ["0.5", 50],
    ["0,05", 5],
    ["10000000", DECLARED_VALUE_MAX_CENTS],
  ])("parses %j", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  test.each([
    "-5",
    "+5",
    "0",
    "0.00",
    "1e9",
    "abc",
    "",
    "   ",
    "10000000.01",
    "10000001",
    "1.2345",
    "1,2345",
    "12.3456,7",
    "1,23,456",
    "1,2345,678",
    "1,234.5.6",
    "1.234,56,7",
    "1,234,56",
    "400.",
    ".5",
    "4 00x",
  ])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

test("the default currency is EUR", () => {
  expect(DEFAULT_CURRENCY).toBe("EUR");
});
