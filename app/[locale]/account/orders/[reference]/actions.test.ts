// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  report: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims }, rpc: mocks.rpc }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/orders/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders/errors")>()),
  reportOrderError: mocks.report,
}));

import { cancelOrder } from "./actions";

const ORDER_PAGE = `NEXT_REDIRECT ${JSON.stringify({ href: "/account/orders/AG-ABCDEFGH", locale: "en" })}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("cancelOrder", () => {
  test("cancels through the RPC and lands on the order page", async () => {
    await expect(cancelOrder("en", "AG-ABCDEFGH")).rejects.toThrow(ORDER_PAGE);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_order", { p_reference: "AG-ABCDEFGH" });
  });

  test("someone else's reference maps not_found, changes nothing and reports nothing", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "not_found" } });

    expect(await cancelOrder("en", "AG-ABCDEFGH")).toEqual({ ok: false, errorKey: "notFound" });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  test("an order that can no longer be cancelled goes to the order page to show its real state", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "transition_not_allowed" } });
    await expect(cancelOrder("en", "AG-ABCDEFGH")).rejects.toThrow(ORDER_PAGE);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  test("an unexpected error is reported by code only and answered generically", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "XX000", message: "boom with AG-ABCDEFGH" } });

    expect(await cancelOrder("en", "AG-ABCDEFGH")).toEqual({ ok: false, errorKey: "generic" });

    expect(mocks.report).toHaveBeenCalledWith("cancelOrder", "XX000");
  });

  test("a malformed reference is notFound before anything is read", async () => {
    await expect(cancelOrder("en", "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test("an unsigned caller is sent to sign-in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(cancelOrder("xx", "AG-ABCDEFGH")).rejects.toThrow("sign-in");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
