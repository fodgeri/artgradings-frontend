// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getPaymentProvider: vi.fn(),
  recordPaymentSuccess: vi.fn(),
  recordPaymentFailure: vi.fn(),
  adminFactory: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims }, from: mocks.from }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.adminFactory }));
vi.mock("@/lib/payments/provider", () => ({ getPaymentProvider: mocks.getPaymentProvider }));
vi.mock("@/lib/payments/record-payment", () => ({
  recordPaymentSuccess: mocks.recordPaymentSuccess,
  recordPaymentFailure: mocks.recordPaymentFailure,
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import { failTestOrder, payTestOrder } from "./actions";

const ORDER = { id: "order-1", total_cents: 9900, currency: "EUR" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  mocks.getPaymentProvider.mockReturnValue({ id: "fake" });
  mocks.maybeSingle.mockResolvedValue({ data: ORDER, error: null });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
  mocks.recordPaymentSuccess.mockResolvedValue("recorded");
  mocks.recordPaymentFailure.mockResolvedValue(undefined);
});

const ORDER_PAGE = `NEXT_REDIRECT ${JSON.stringify({ href: "/account/orders/AG-ABCDEFGH", locale: "en" })}`;

describe.each([
  ["payTestOrder", payTestOrder, mocks.recordPaymentSuccess],
  ["failTestOrder", failTestOrder, mocks.recordPaymentFailure],
])("%s", (_name, action, record) => {
  test("404s when PAYMENT_PROVIDER is unset, before anything is read", async () => {
    mocks.getPaymentProvider.mockReturnValue(null);

    await expect(action("en", "AG-ABCDEFGH")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  test("an order the caller does not own is notFound, and the admin client is never reached", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(action("en", "AG-ABCDEFGH")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(record).not.toHaveBeenCalled();
    expect(mocks.adminFactory).not.toHaveBeenCalled();
  });

  test("uses a deterministic provider reference and the amount from the row, then goes to the order page", async () => {
    await expect(action("en", "AG-ABCDEFGH")).rejects.toThrow(ORDER_PAGE);
    await expect(action("en", "AG-ABCDEFGH")).rejects.toThrow(ORDER_PAGE);

    expect(record).toHaveBeenCalledTimes(2);
    const [first, second] = record.mock.calls.map((c) => c[0]);
    expect(first).toEqual({
      orderId: "order-1",
      provider: "fake",
      providerReference: "fake_order-1",
      amountCents: 9900,
      currency: "EUR",
    });
    expect(second).toEqual(first);
  });

  test("looks the order up by reference only, under the session client", async () => {
    await expect(action("en", "AG-ABCDEFGH")).rejects.toThrow(ORDER_PAGE);
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.eq).toHaveBeenCalledWith("reference", "AG-ABCDEFGH");
  });

  test("a malformed reference is notFound without a query", async () => {
    await expect(action("en", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("an unknown locale falls back, an unsigned caller is sent to sign-in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(action("xx", "AG-ABCDEFGH")).rejects.toThrow("sign-in");
    expect(record).not.toHaveBeenCalled();
  });
});
