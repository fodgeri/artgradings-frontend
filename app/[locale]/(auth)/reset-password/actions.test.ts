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
const SIGNED_IN = { data: { claims: { sub: "user-1", email: "user@example.test" } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue(SIGNED_IN);
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("resetPassword", () => {
  test("sets the password, evicts other sessions, and lands on /account", async () => {
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("still lands on /account when evicting other sessions fails", async () => {
    // The password HAS changed. Telling the user it failed would be false.
    mocks.signOut.mockResolvedValue({ error: new AuthError("boom", 500, "unexpected_failure") });
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("sends a visitor without a session to forgot-password", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(resetPassword("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/forgot-password", locale: "en" });
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
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
