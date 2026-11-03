// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), captureException: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { recordPaymentFailure, recordPaymentSuccess } from "./record-payment";

const INPUT = {
  orderId: "11111111-1111-1111-1111-111111111111",
  provider: "fake",
  providerReference: "fake_11111111-1111-1111-1111-111111111111",
  amountCents: 12345,
  currency: "eur",
} as const;

beforeEach(() => vi.clearAllMocks());

describe("recordPaymentSuccess", () => {
  test("passes the amount and reference through and returns the database's verdict", async () => {
    mocks.rpc.mockResolvedValue({ data: "recorded", error: null });

    await expect(recordPaymentSuccess(INPUT)).resolves.toBe("recorded");

    expect(mocks.rpc).toHaveBeenCalledWith("record_payment_success", {
      p_order_id: INPUT.orderId,
      p_provider: "fake",
      p_provider_reference: INPUT.providerReference,
      p_amount_cents: 12345,
      p_currency: "EUR", // uppercased: the database compares case-sensitively
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("reports a rejected charge without a payload and still returns the verdict", async () => {
    mocks.rpc.mockResolvedValue({ data: "rejected", error: null });

    await expect(recordPaymentSuccess(INPUT)).resolves.toBe("rejected");

    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain(INPUT.orderId);
  });

  test("a duplicate is not reported", async () => {
    mocks.rpc.mockResolvedValue({ data: "duplicate", error: null });
    await expect(recordPaymentSuccess(INPUT)).resolves.toBe("duplicate");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("an RPC error is reported without the payload and rethrown", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "nope" } });

    await expect(recordPaymentSuccess(INPUT)).rejects.toThrow();

    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const dump = JSON.stringify(mocks.captureException.mock.calls);
    expect(dump).toContain("recordPayment");
    expect(dump).not.toContain(INPUT.orderId);
    expect(dump).not.toContain(INPUT.providerReference);
  });

  test("an unexpected verdict is an error", async () => {
    mocks.rpc.mockResolvedValue({ data: "weird", error: null });
    await expect(recordPaymentSuccess(INPUT)).rejects.toThrow();
  });
});

describe("recordPaymentFailure", () => {
  test("records a failed attempt with an uppercased currency", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await recordPaymentFailure(INPUT);

    expect(mocks.rpc).toHaveBeenCalledWith("record_payment_failure", expect.objectContaining({
      p_currency: "EUR",
      p_provider_reference: INPUT.providerReference,
    }));
  });

  test("an RPC error is reported and rethrown", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(recordPaymentFailure(INPUT)).rejects.toThrow();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });
});
