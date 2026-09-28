// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signIn } = await import("./actions");

const VALID = { email: "user@example.test", password: "password123!", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signIn", () => {
  test("signs in with the captcha token and lands on /account by default", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    await expect(signIn("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "password123!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test("returns to a same-origin next", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, next: "/submit?x=1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/submit?x=1", locale: "en" });
  });

  test("ignores an off-site next", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, next: "//evil.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account", locale: "en" });
  });

  test.each([
    ["invalid_credentials", "invalidCredentials"],
    ["email_not_confirmed", "emailNotConfirmed"],
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await signIn("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("treats a missing password as bad credentials without calling Supabase", async () => {
    expect(await signIn("en", initialAuthState, formData({ ...VALID, password: "" }))).toEqual({
      status: "error",
      errorKey: "invalidCredentials",
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("does not apply the sign-up password policy", async () => {
    // Existing passwords predate any policy change and must keep working.
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    await expect(
      signIn("en", initialAuthState, formData({ ...VALID, password: "short" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
