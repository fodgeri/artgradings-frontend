// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  captureException: vi.fn(),
  cookieNames: [] as string[],
  deleteCookie: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocks.cookieNames.map((name) => ({ name, value: "x" })),
    delete: mocks.deleteCookie,
  }),
}));

const { endLocalSession } = await import("./end-local-session");

// Only `auth.signOut` is used; the cast keeps the fake to what matters.
const supabase = { auth: { signOut: mocks.signOut } } as unknown as Parameters<
  typeof endLocalSession
>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieNames = [
    "sb-127-auth-token.0",
    "sb-127-auth-token.1",
    "sb-127-auth-token-code-verifier",
    "NEXT_LOCALE",
  ];
});

describe("endLocalSession", () => {
  test("signs this browser out and leaves the cookies to Supabase", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await endLocalSession(supabase, "signOut");

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  test("on a failure, clears the auth cookies itself and reports", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("fetch failed") });
    await endLocalSession(supabase, "deleteAccount");

    const deleted = mocks.deleteCookie.mock.calls.map(([name]) => name);
    expect(deleted.sort()).toEqual([
      "sb-127-auth-token-code-verifier",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
    ]);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls[0][1]).toMatchObject({
      tags: { "auth.flow": "deleteAccount" },
    });
  });
});
