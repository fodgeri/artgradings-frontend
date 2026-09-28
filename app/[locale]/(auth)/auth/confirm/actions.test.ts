// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { confirmToken } = await import("./actions");

const LINK_EXPIRED = {
  href: { pathname: "/sign-in", query: { error: "link_expired" } },
  locale: "en",
};

async function confirm(fields: Record<string, string>) {
  await expect(confirmToken("en", initialAuthState, formData(fields))).rejects.toThrow(
    "NEXT_REDIRECT",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmToken", () => {
  test("an email confirmation lands on /account", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "hash-1" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("a recovery link lands on /reset-password", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    await confirm({ token_hash: "hash-1", type: "recovery" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-1" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/reset-password", locale: "en" });
  });

  test("an expired link goes to sign-in quietly", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {},
      error: new AuthError("Email link is invalid or has expired", 403, "otp_expired"),
    });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("an unexpected failure also goes to sign-in, and is reported", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: new AuthError("boom", 500, "unexpected_failure") });
    await confirm({ token_hash: "hash-1", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test.each(["signup", "magiclink", "invite", "email_change", "toString", "constructor", ""])(
    "refuses type %j without calling Supabase",
    async (type) => {
      await confirm({ token_hash: "hash-1", type });
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
    },
  );

  test("refuses a missing token without calling Supabase", async () => {
    await confirm({ type: "email" });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(LINK_EXPIRED);
  });
});
