// @vitest-environment node
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
  query.select.mockImplementation(() => query);
  query.eq.mockImplementation(() => query);
  return {
    query,
    from: vi.fn(() => query),
    getUser: vi.fn(),
    redirect: vi.fn((args: unknown) => {
      throw new Error(`NEXT_REDIRECT ${JSON.stringify(args)}`);
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { loadSettings } = await import("./load-settings");

const USER = { id: "user-1", email: "stale@example.test" };
const PROFILE = { data: { first_name: "Ada", last_name: null }, error: null };
const NO_ROW = {
  data: null,
  error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "current@example.test" } },
    error: null,
  });
  mocks.query.single.mockResolvedValue(PROFILE);
});

describe("loadSettings", () => {
  test("reads the user's own profile, and the address from Auth rather than the JWT", async () => {
    expect(await loadSettings("en", USER)).toEqual({
      firstName: "Ada",
      lastName: null,
      email: "current@example.test",
    });
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.query.eq).toHaveBeenCalledWith("id", "user-1");
  });

  test("an account deleted elsewhere is sent to sign in, not a 500", async () => {
    // Within the access token's lifetime the claims still verify, but Auth no
    // longer knows the user and the profile row is gone with them.
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthError("gone", 403) });
    mocks.query.single.mockResolvedValue(NO_ROW);

    await expect(loadSettings("en", USER)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: { pathname: "/sign-in", query: { next: "/account/settings" } },
      locale: "en",
    });
  });

  test("a profile that cannot be read for a user Auth still knows is an outage", async () => {
    mocks.query.single.mockResolvedValue(NO_ROW);
    await expect(loadSettings("en", USER)).rejects.toThrow(
      "Could not load the profile for the settings page",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
