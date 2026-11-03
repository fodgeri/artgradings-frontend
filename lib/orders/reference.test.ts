import { expect, test } from "vitest";

import { ORDER_REFERENCE_PATTERN, orderPath } from "./reference";

test("orderPath is the short printed path", () => {
  expect(orderPath("AG-0123ABCD")).toBe("/o/AG-0123ABCD");
});

test("the pattern uses the Crockford alphabet", () => {
  expect(ORDER_REFERENCE_PATTERN.test("AG-0123ABCD")).toBe(true);
  expect(ORDER_REFERENCE_PATTERN.test("AG-0123ABCI")).toBe(false); // I
  expect(ORDER_REFERENCE_PATTERN.test("AG-0123ABCU")).toBe(false); // U
  expect(ORDER_REFERENCE_PATTERN.test("AG-0123ABC")).toBe(false);
  expect(ORDER_REFERENCE_PATTERN.test("ag-0123ABCD")).toBe(false);
});
