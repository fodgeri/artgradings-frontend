// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  captureException: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

const { signOut } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signOut", () => {
  test("signs out this browser only and goes home", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
  });

  test("reports a failure and still goes home", async () => {
    mocks.signOut.mockResolvedValue({ error: new AuthError("boom", 500, "unexpected_failure") });
    await expect(signOut("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "en" });
  });
});
