// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { initialAuthState } from "@/lib/auth/action-state";
import { formData } from "@/test/form-data";

const mocks = vi.hoisted(() => {
  const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
  query.update.mockImplementation(() => query);
  query.eq.mockImplementation(() => query);
  query.select.mockImplementation(() => query);
  return {
    query,
    from: vi.fn(() => query),
    getClaims: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    deleteCurrentUser: vi.fn(),
    endLocalSession: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    redirect: vi.fn((args: unknown) => {
      throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/auth/delete-current-user", () => ({ deleteCurrentUser: mocks.deleteCurrentUser }));
vi.mock("@/lib/auth/end-local-session", () => ({ endLocalSession: mocks.endLocalSession }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

const actions = await import("./actions");

// The claims and Auth deliberately disagree about the address: after an email
// change completes elsewhere, the JWT lags by up to an hour. Actions must use
// Auth's.
const CLAIMS = { data: { claims: { sub: "user-1", email: "stale@example.test" } }, error: null };
const AUTH_USER = { data: { user: { id: "user-1", email: "current@example.test" } }, error: null };
const SIGN_IN = { href: { pathname: "/sign-in", query: { next: "/account/settings" } }, locale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue(CLAIMS);
  mocks.getUser.mockResolvedValue(AUTH_USER);
});

describe("updateName", () => {
  const { updateName } = actions;

  test("saves both trimmed names on the signed-in user's own row", async () => {
    mocks.query.single.mockResolvedValue({ data: { id: "user-1" }, error: null });

    const result = await updateName(
      "en",
      initialAuthState,
      formData({ firstName: "  Ada ", lastName: "Lovelace", id: "someone-else" }),
    );

    expect(result).toEqual({ status: "sent" });
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.query.update).toHaveBeenCalledWith({ first_name: "Ada", last_name: "Lovelace" });
    expect(mocks.query.eq).toHaveBeenCalledWith("id", "user-1");
    expect(mocks.query.select).toHaveBeenCalledWith("id");
  });

  test("clears a whitespace-only name to null", async () => {
    mocks.query.single.mockResolvedValue({ data: { id: "user-1" }, error: null });
    await updateName("en", initialAuthState, formData({ firstName: "   ", lastName: "" }));
    expect(mocks.query.update).toHaveBeenCalledWith({ first_name: null, last_name: null });
  });

  test("rejects a name over the limit without writing", async () => {
    const result = await updateName(
      "en",
      initialAuthState,
      formData({ firstName: "a".repeat(101), lastName: "B" }),
    );
    expect(result).toEqual({ status: "error", errorKey: "nameTooLong" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("an update that returns no row is an error, and is reported", async () => {
    // What a missing select policy looks like: nothing matched, nothing raised.
    mocks.query.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    });

    const result = await updateName("en", initialAuthState, formData({ firstName: "Ada", lastName: "" }));

    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "updateName", "db.code": "PGRST116" },
    });
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(
      updateName("en", initialAuthState, formData({ firstName: "Ada", lastName: "" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("changeEmail", () => {
  const { changeEmail } = actions;

  test("asks Supabase to change the address and reports it sent", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    const result = await changeEmail("en", initialAuthState, formData({ email: " new@example.test " }));
    expect(result).toEqual({ status: "sent" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: "new@example.test" });
  });

  test("rejects a malformed address without calling Supabase", async () => {
    const result = await changeEmail("en", initialAuthState, formData({ email: "not-an-address" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test("rejects the current address, compared case-insensitively, against Auth not the JWT", async () => {
    const result = await changeEmail("en", initialAuthState, formData({ email: "CURRENT@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "emailUnchanged" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test.each(["email_exists", "user_already_exists", "over_email_send_rate_limit"])(
    "treats %s exactly like success, and reports it as suppressed",
    async (code) => {
      // A taken address (email_exists) and a free one resubmitted quickly
      // (over_email_send_rate_limit) must be indistinguishable, or submitting
      // an address twice reveals whether it is registered.
      mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, code) });
      const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
      expect(result).toEqual({ status: "sent" });
      expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
      expect(mocks.captureException).not.toHaveBeenCalled();
    },
  );

  test("maps an invalid address from Supabase", async () => {
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: new AuthError("x", 400, "email_address_invalid"),
    });
    const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "invalidEmail" });
  });

  test("reports an unexpected failure", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 500, "unexpected_failure") });
    const result = await changeEmail("en", initialAuthState, formData({ email: "new@example.test" }));
    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(
      changeEmail("en", initialAuthState, formData({ email: "new@example.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
  });

  test("when Auth no longer knows the user, sends them to sign in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthError("gone", 403) });
    await expect(
      changeEmail("en", initialAuthState, formData({ email: "new@example.test" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  const { changePassword } = actions;
  const VALID = {
    currentPassword: "old-password!",
    password: "new-password-123",
    captchaToken: "token-abc",
  };

  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  test("re-verifies against Auth's address, evicts other sessions, then changes the password", async () => {
    const result = await changePassword(
      "en",
      initialAuthState,
      formData({ ...VALID, email: "attacker@example.test" }),
    );

    expect(result).toEqual({ status: "sent" });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "current@example.test",
      password: "old-password!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0],
    );
  });

  test("a wrong current password stops before anything changes", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const result = await changePassword("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  test("an empty current password never reaches Supabase", async () => {
    const result = await changePassword(
      "en",
      initialAuthState,
      formData({ ...VALID, currentPassword: "" }),
    );
    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("applies the password policy before re-verifying", async () => {
    const result = await changePassword("en", initialAuthState, formData({ ...VALID, password: "short" }));
    expect(result).toEqual({ status: "error", errorKey: "passwordTooShort" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  test("maps a failed captcha", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("x", 400, "captcha_failed"),
    });
    const result = await changePassword("en", initialAuthState, formData(VALID));
    expect(result).toEqual({ status: "error", errorKey: "captchaFailed" });
  });

  test("a failed eviction leaves the password unchanged, and is reported", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("fetch failed") });
    const result = await changePassword("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "sessionsNotRevoked" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  test("maps same_password", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: new AuthError("x", 422, "same_password") });
    const result = await changePassword("en", initialAuthState, formData(VALID));
    expect(result).toEqual({ status: "error", errorKey: "samePassword" });
  });

  test("without a session, sends the user to sign in", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(changePassword("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  const { deleteAccount } = actions;
  const VALID = { currentPassword: "old-password!", captchaToken: "token-abc" };

  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mocks.deleteCurrentUser.mockResolvedValue({ error: null });
    mocks.endLocalSession.mockResolvedValue(undefined);
  });

  test("re-verifies, deletes, ends the session here, and says goodbye", async () => {
    await expect(deleteAccount("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "current@example.test",
      password: "old-password!",
      options: { captchaToken: "token-abc" },
    });
    expect(mocks.deleteCurrentUser).toHaveBeenCalledWith();
    expect(mocks.endLocalSession).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.anything() }),
      "deleteAccount",
    );
    expect(mocks.deleteCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.endLocalSession.mock.invocationCallOrder[0],
    );
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/account-deleted", locale: "en" });
  });

  test("a wrong current password deletes nothing", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const result = await deleteAccount("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "currentPasswordIncorrect" });
    expect(mocks.deleteCurrentUser).not.toHaveBeenCalled();
    expect(mocks.endLocalSession).not.toHaveBeenCalled();
  });

  test("a failed deletion keeps the session and reports", async () => {
    mocks.deleteCurrentUser.mockResolvedValue({
      error: new AuthError("boom", 500, "unexpected_failure"),
    });
    const result = await deleteAccount("en", initialAuthState, formData(VALID));

    expect(result).toEqual({ status: "error", errorKey: "generic" });
    expect(mocks.endLocalSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "deleteAccount" },
    });
  });

  test("without a session, sends the user to sign in and deletes nothing", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(deleteAccount("en", initialAuthState, formData(VALID))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(SIGN_IN);
    expect(mocks.deleteCurrentUser).not.toHaveBeenCalled();
  });
});
