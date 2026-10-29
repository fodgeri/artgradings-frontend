import { expect, test } from "vitest";

import { DELETION_BLOCKING, JOURNEY, ORDER_STATUSES } from "./status";

test("there are nine statuses", () => {
  expect(ORDER_STATUSES).toHaveLength(9);
});

test("the journey is every status but draft and cancelled, in order", () => {
  expect(JOURNEY).toEqual([
    "awaiting_payment", "paid", "received", "grading", "graded", "shipped_back", "completed",
  ]);
});

test("deletion is blocked from paid until the order is shipped back", () => {
  expect(DELETION_BLOCKING).toEqual(["paid", "received", "grading", "graded", "shipped_back"]);
});
