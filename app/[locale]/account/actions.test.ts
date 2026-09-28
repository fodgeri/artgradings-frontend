// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  captureException: vi.fn(),
  cookieNames: [] as string[],
  deleteCookie: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocks.cookieNames.map((name) => ({ name, value: "x" })),
    delete: mocks.deleteCookie,
  }),
}));

const { signOut } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieNames = [
    "sb-127-auth-token.0",
    "sb-127-auth-token.1",
    "sb-127-auth-token-code-verifier",
    "NEXT_LOCALE",
  ];
});

describe("signOut", () => {
  test("signs out this browser only and goes home", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
    // Supabase cleared its own cookies; nothing to do by hand.
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });

  test("on a failure, clears the auth cookies itself, reports, and goes home", async () => {
    // If auth-js fails before it can remove the session (e.g. an expired
    // token it cannot refresh), the browser would stay signed in while being
    // told it had signed out.
    mocks.signOut.mockResolvedValue({ error: new AuthError("fetch failed") });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");

    const deleted = mocks.deleteCookie.mock.calls.map(([name]) => name);
    expect(deleted.sort()).toEqual([
      "sb-127-auth-token-code-verifier",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
    ]);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
  });
});
