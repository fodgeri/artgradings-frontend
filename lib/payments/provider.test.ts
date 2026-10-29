// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

import { getPaymentProvider } from "./provider";

afterEach(() => vi.unstubAllEnvs());

describe("getPaymentProvider", () => {
  test("is null when PAYMENT_PROVIDER is unset or unknown", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(getPaymentProvider()).toBeNull();
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
    expect(getPaymentProvider()).toBeNull();
  });

  test("is the fake provider, which points at the test payment page", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    const provider = getPaymentProvider();
    expect(provider?.id).toBe("fake");
    await expect(provider?.startPayment({ reference: "AG-ABCDEFGH" })).resolves.toBe(
      "/account/orders/AG-ABCDEFGH/pay",
    );
  });
});
