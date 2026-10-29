// @vitest-environment node
import * as Sentry from "@sentry/nextjs";
import { afterEach, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";

import { orderErrorKey, reportOrderError, type OrderErrorKey } from "./errors";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

afterEach(() => vi.clearAllMocks());

test.each([
  ["not_found", "notFound"],
  ["not_draft", "notDraft"],
  ["incomplete", "incomplete"],
  ["service_unavailable", "serviceUnavailable"],
  ["tier_unavailable", "tierUnavailable"],
  ["add_on_unavailable", "addOnUnavailable"],
  ["declared_value_over_cap", "overCap"],
  ["country_unsupported", "countryUnsupported"],
  ["too_many_cards", "tooManyCards"],
  ["card_gone", "cardGone"],
  ["photo_too_large", "photoTooLarge"],
  ["photo_type", "photoType"],
  ["photo_limit", "photoLimit"],
  ["terms_required", "termsRequired"],
  ["something else", "generic"],
] as const)("maps %s", (message, key) => {
  expect(orderErrorKey({ code: "P0001", message })).toBe(key);
});

test("never maps a non-P0001 error by message", () => {
  expect(orderErrorKey({ code: "42501", message: "incomplete" })).toBe("generic");
  expect(orderErrorKey({ message: "incomplete" })).toBe("generic");
  expect(orderErrorKey(null)).toBe("generic");
});

test("matches the message exactly, not by substring", () => {
  expect(orderErrorKey({ code: "P0001", message: "not_found: order 12" })).toBe("generic");
});

test("every key has copy under submit.errors", () => {
  const keys: OrderErrorKey[] = [
    "notFound", "notDraft", "incomplete", "serviceUnavailable", "tierUnavailable",
    "addOnUnavailable", "overCap", "countryUnsupported", "tooManyCards", "cardGone",
    "photoTooLarge", "photoType", "photoLimit", "termsRequired", "generic",
  ];
  for (const key of keys) expect(messages.submit.errors).toHaveProperty(key);
});

test("reportOrderError tags the flow and code and attaches nothing else", () => {
  reportOrderError("saveCard", "42501");
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  const [error, hint] = vi.mocked(Sentry.captureException).mock.calls[0];
  expect((error as Error).message).toBe("Order error in saveCard");
  expect(hint).toEqual({ tags: { "order.flow": "saveCard", "order.code": "42501" } });
});
