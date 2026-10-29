import { describe, expect, test } from "vitest";

import { ORDER_STATUSES } from "./status";
import { nextAction, printablesAvailable } from "./next-action";

describe("nextAction", () => {
  test("awaiting payment without a provider says payment is unavailable", () => {
    const order = { status: "awaiting_payment", shippingMethod: "postal" } as const;
    expect(nextAction(order, { payment: false })).toEqual({ kind: "paymentUnavailable" });
    expect(nextAction(order, { payment: true })).toEqual({ kind: "pay" });
  });

  test("paid postal is ship, paid in person is bringIn", () => {
    expect(nextAction({ status: "paid", shippingMethod: "postal" }, { payment: true })).toEqual({ kind: "ship" });
    expect(nextAction({ status: "paid", shippingMethod: "in_person" }, { payment: false })).toEqual({
      kind: "bringIn",
    });
  });

  test.each(["draft", "received", "grading", "graded", "shipped_back", "completed", "cancelled"] as const)(
    "%s offers nothing",
    (status) => {
      expect(nextAction({ status, shippingMethod: "postal" }, { payment: true })).toEqual({ kind: "none" });
    },
  );
});

describe("printablesAvailable", () => {
  test("is false until paid and after cancelling", () => {
    const available = ORDER_STATUSES.filter(printablesAvailable);
    expect(available).toEqual(["paid", "received", "grading", "graded", "shipped_back", "completed"]);
  });
});
