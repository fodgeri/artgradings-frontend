// @vitest-environment node
import { AuthError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
// Mocked, so the real module's `import "server-only"` never loads here.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));

const { deleteCurrentUser } = await import("./delete-current-user");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteCurrentUser", () => {
  test("hard-deletes the user named by the verified claims, and only them", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await deleteCurrentUser()).toEqual({ error: null });
    // Exactly one argument: a second `true` would make it a soft delete.
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
  });

  test("passes the admin API's error back", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const failure = new AuthError("boom", 500, "unexpected_failure");
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: failure });

    expect(await deleteCurrentUser()).toEqual({ error: failure });
  });

  test("deletes nothing without a verified session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    const { error } = await deleteCurrentUser();
    expect(error).toBeInstanceOf(AuthSessionMissingError);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
