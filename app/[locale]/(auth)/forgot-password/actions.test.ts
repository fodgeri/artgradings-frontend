// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } }),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

const { requestPasswordReset } = await import("./actions");

const VALID = { email: "user@example.test", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  test("requests the email with the captcha token and reports sent", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("user@example.test", {
      captchaToken: "token-abc",
    });
  });

  test.each([
    ["an unknown address", null, 0],
    ["a per-address rate limit", new AuthError("wait", 429, "over_email_send_rate_limit"), 1],
  ])("answers %s exactly like a known one", async (_label, error, suppressedCalls) => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
    expect(mocks.captureMessage).toHaveBeenCalledTimes(suppressedCalls);
  });

  test.each([
    ["captcha_failed", "captchaFailed"],
    ["over_request_rate_limit", "rateLimited"],
  ])("shows %s, which says nothing about the account", async (code, errorKey) => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: new AuthError("x", 400, code) });
    expect(await requestPasswordReset("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey,
    });
  });

  test("rejects a malformed email without calling Supabase", async () => {
    expect(
      await requestPasswordReset("en", initialAuthState, formData({ ...VALID, email: "nope" })),
    ).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
