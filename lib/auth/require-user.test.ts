// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  redirect: vi.fn((args: unknown) => {
    throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { getUser, requireUser } = await import("./require-user");

const CLAIMS = { data: { claims: { sub: "user-1", email: "user@example.test" } }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUser", () => {
  test("returns the user from verified claims", async () => {
    mocks.getClaims.mockResolvedValue(CLAIMS);
    expect(await getUser()).toEqual({ id: "user-1", email: "user@example.test" });
  });

  test("returns null without a session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getUser()).toBeNull();
  });

  test("returns null when the claims do not verify", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new AuthError("invalid JWT") });
    expect(await getUser()).toBeNull();
  });
});

describe("requireUser", () => {
  test("returns the user when signed in", async () => {
    mocks.getClaims.mockResolvedValue(CLAIMS);
    await expect(requireUser({ locale: "en", next: "/account" })).resolves.toEqual({
      id: "user-1",
      email: "user@example.test",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("redirects to sign-in, carrying next, when signed out", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(requireUser({ locale: "en", next: "/account" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: { pathname: "/sign-in", query: { next: "/account" } },
      locale: "en",
    });
  });
});
