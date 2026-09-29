// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims, updateUser: mocks.updateUser, signOut: mocks.signOut },
  }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { resetPassword } = await import("./actions");

const VALID = { password: "a-new-password-1" };
const nowSeconds = () => Math.floor(Date.now() / 1000);
const claims = (method: string, timestamp = nowSeconds()) => ({
  data: { claims: { sub: "user-1", email: "user@example.test", amr: [{ method, timestamp }] } },
  error: null,
});
// What a verified recovery link yields: GoTrue records it as `otp`.
const SIGNED_IN = claims("otp");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue(SIGNED_IN);
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("resetPassword", () => {
  test("evicts other sessions, then sets the password, and lands on /account", async () => {
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0],
    );
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("keeps the old password and says so when evicting other sessions fails", async () => {
    // Whoever the reset is meant to lock out must not keep a session silently.
    // Nothing has changed yet, so resubmitting retries both steps.
    mocks.signOut.mockResolvedValue({ error: new AuthError("boom", 500, "unexpected_failure") });
    expect(await resetPassword("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey: "sessionsNotRevoked",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("sends a visitor without a session to forgot-password", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/forgot-password", locale: "en" });
  });

  test.each([
    ["an ordinary password session", () => claims("password")],
    ["a recovery session older than the hour", () => claims("otp", nowSeconds() - 60 * 60 - 60)],
  ])("sends %s to settings and changes nothing", async (_label, session) => {
    // Without this, anyone holding the owner's session — an unlocked laptop,
    // a stolen cookie — could set a password with no current password and no
    // captcha, and evict the owner.
    mocks.getClaims.mockResolvedValue(session());
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account/settings", locale: "en" });
  });

  test("applies the password policy before calling Supabase", async () => {
    expect(await resetPassword("en", initialAuthState, formData({ password: "short" }))).toEqual({
      status: "error",
      errorKey: "passwordTooShort",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test.each([
    ["same_password", "samePassword"],
    ["weak_password", "weakPassword"],
    ["reauthentication_needed", "reauthenticationNeeded"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, code) });
    expect(await resetPassword("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
  });
});
