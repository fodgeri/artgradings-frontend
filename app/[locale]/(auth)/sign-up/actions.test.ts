// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: mocks.signUp } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signUp } = await import("./actions");

const EMAIL = "new@example.test";
const VALID = { email: EMAIL, password: "long-enough-1", captchaToken: "token-abc" };
const CHECK_EMAIL = { href: "/sign-up/check-email", locale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUp", () => {
  test("signs up with the captcha token and redirects to check-email", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });

    await expect(signUp("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: VALID.password,
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });

  test("trims the email address", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(
      signUp("en", initialAuthState, formData({ ...VALID, email: `  ${EMAIL} ` })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signUp.mock.calls[0][0].email).toBe(EMAIL);
  });

  test.each([
    ["an existing account", null],
    ["a per-address rate limit", new AuthError("rate limited", 429, "over_email_send_rate_limit")],
    ["user_already_exists", new AuthError("exists", 422, "user_already_exists")],
  ])("answers %s exactly like a new address", async (_label, error) => {
    // With confirmations on, Supabase returns an obfuscated user for an
    // existing address rather than an error; the per-address rate limit only
    // fires for an address it knows. Neither may leak.
    mocks.signUp.mockResolvedValue({ data: {}, error });
    await expect(signUp("en", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });

  test("rejects a malformed email without calling Supabase", async () => {
    const result = await signUp("en", initialAuthState, formData({ ...VALID, email: "nope" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test("rejects a short password without calling Supabase", async () => {
    const result = await signUp("en", initialAuthState, formData({ ...VALID, password: "short" }));
    expect(result).toEqual({ status: "error", errorKey: "passwordTooShort" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test("rejects a password over 72 bytes without calling Supabase", async () => {
    const result = await signUp(
      "en",
      initialAuthState,
      formData({ ...VALID, password: "é".repeat(37) }),
    );
    expect(result).toEqual({ status: "error", errorKey: "passwordTooLong" });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  test.each([
    ["weak_password", "weakPassword"],
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s as %s", async (code, errorKey) => {
    mocks.signUp.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await signUp("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
  });

  test("reports an unexpected error to Sentry without the address", async () => {
    mocks.signUp.mockResolvedValue({
      data: {},
      error: new AuthError(`Database error saving ${EMAIL}`, 500, "unexpected_failure"),
    });
    expect(await signUp("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey: "generic",
    });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.captureException.mock.calls, (_k, v) => (v instanceof Error ? v.message : v))).not.toContain(EMAIL);
  });

  test("falls back to the default locale for an unknown one", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(signUp("xx", initialAuthState, formData(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(CHECK_EMAIL);
  });
});
