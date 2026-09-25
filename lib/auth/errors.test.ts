// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

const { AUTH_ERROR_KEYS, authErrorKey, reportAuthError, reportSuppressedAuthError, revealsAccount } =
  await import("./errors");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authErrorKey", () => {
  test.each(Object.entries(AUTH_ERROR_KEYS))(
    "%s maps to a message that exists",
    (_code, key) => {
      // Checked against the real messages file, so renaming a key fails here.
      expect(messages.auth.errors[key]).toBeTypeOf("string");
    },
  );

  test("maps a known code without reporting it", () => {
    const error = new AuthError("Invalid login credentials", 400, "invalid_credentials");
    expect(authErrorKey(error, "signIn")).toBe("invalidCredentials");
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("maps an unknown code to generic and reports it", () => {
    const error = new AuthError("Database error", 500, "unexpected_failure");
    expect(authErrorKey(error, "signUp")).toBe("generic");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("maps a code-less error (network failure) to generic and reports it", () => {
    expect(authErrorKey(new AuthError("fetch failed"), "signIn")).toBe("generic");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("does not treat an inherited property name as a code", () => {
    const error = new AuthError("odd", 400, "toString");
    expect(authErrorKey(error, "signIn")).toBe("generic");
  });
});

describe("reportAuthError", () => {
  test("sends the flow and code, never the Supabase message", () => {
    // GoTrue embeds the submitted address in some messages.
    const error = new AuthError('Email address "someone@example.test" is invalid', 400, "odd_code");
    reportAuthError(error, "signUp");

    const [reported, context] = mocks.captureException.mock.calls[0];
    expect(JSON.stringify([String(reported), context])).not.toContain("someone@example.test");
    expect(context).toMatchObject({
      tags: { "auth.flow": "signUp", "auth.code": "odd_code", "auth.status": "400" },
    });
  });
});

describe("reportSuppressedAuthError", () => {
  test("sends a warning with the flow and code, never the Supabase message", () => {
    const error = new AuthError("wait before retrying someone@example.test", 429, "over_email_send_rate_limit");
    reportSuppressedAuthError(error, "signUp");

    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = mocks.captureMessage.mock.calls[0];
    expect(JSON.stringify([message, context])).not.toContain("someone@example.test");
    expect(context).toMatchObject({
      level: "warning",
      tags: {
        "auth.flow": "signUp",
        "auth.code": "over_email_send_rate_limit",
        "auth.status": "429",
      },
    });
  });
});

describe("revealsAccount", () => {
  test.each(["over_email_send_rate_limit", "user_already_exists", "email_exists"])(
    "%s depends on whether the account exists",
    (code) => {
      expect(revealsAccount(new AuthError("x", 429, code))).toBe(true);
    },
  );

  test.each(["captcha_failed", "over_request_rate_limit", "weak_password"])(
    "%s does not",
    (code) => {
      expect(revealsAccount(new AuthError("x", 400, code))).toBe(false);
    },
  );

  test("a code-less error does not", () => {
    expect(revealsAccount(new AuthError("fetch failed"))).toBe(false);
  });
});
