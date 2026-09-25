// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => ({ resend: vi.fn(), captureException: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resend: mocks.resend } }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { resendConfirmation } = await import("./actions");

const VALID = { email: "new@example.test", captchaToken: "token-abc" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resendConfirmation", () => {
  test("resends the signup email with the captcha token", async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.test",
      options: { captchaToken: "token-abc" },
    });
  });

  test("reports success inside the per-address resend window", async () => {
    mocks.resend.mockResolvedValue({
      data: {},
      error: new AuthError("wait", 429, "over_email_send_rate_limit"),
    });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "sent",
    });
  });

  test("returns a new state object every time", async () => {
    // The Turnstile widget resets on state identity.
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    const first = await resendConfirmation("en", initialAuthState, formData(VALID));
    const second = await resendConfirmation("en", first, formData(VALID));
    expect(second).not.toBe(first);
  });

  test("shows a failed captcha", async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: new AuthError("x", 400, "captcha_failed") });
    expect(await resendConfirmation("en", initialAuthState, formData(VALID))).toEqual({
      status: "error",
      errorKey: "captchaFailed",
    });
  });

  test("rejects a malformed email without calling Supabase", async () => {
    expect(
      await resendConfirmation("en", initialAuthState, formData({ ...VALID, email: "nope" })),
    ).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
