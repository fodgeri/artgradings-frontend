// @vitest-environment node
import { AuthError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
// Mocked, so the real module's `import "server-only"` never loads here.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));

const { deleteCurrentUser } = await import("./delete-current-user");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: "ok", error: null });
  mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("deleteCurrentUser", () => {
  test("prepares the orders, then hard-deletes the user named by the verified claims", async () => {
    expect(await deleteCurrentUser()).toEqual({ status: "deleted" });

    expect(mocks.rpc).toHaveBeenCalledWith("prepare_account_deletion", { p_user_id: "user-1" });
    // Exactly one argument: a second `true` would make it a soft delete.
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteUser.mock.invocationCallOrder[0],
    );
  });

  test("is refused while an order is in progress, and deletes nobody", async () => {
    mocks.rpc.mockResolvedValue({ data: "orders_in_progress", error: null });

    expect(await deleteCurrentUser()).toEqual({ status: "ordersInProgress" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  test("a preparation error returns its code only, and deletes nobody", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "secret@example.test" } });

    expect(await deleteCurrentUser()).toEqual({ status: "prepareFailed", code: "42501" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  test("an unexpected preparation answer deletes nobody", async () => {
    mocks.rpc.mockResolvedValue({ data: "something_else", error: null });

    expect(await deleteCurrentUser()).toEqual({ status: "prepareFailed", code: "unexpected_result" });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  test("passes the admin API's error back", async () => {
    const failure = new AuthError("boom", 500, "unexpected_failure");
    mocks.deleteUser.mockResolvedValue({ data: { user: null }, error: failure });

    expect(await deleteCurrentUser()).toEqual({ status: "deleteFailed", error: failure });
  });

  test("touches nothing without a verified session", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });

    const result = await deleteCurrentUser();
    expect(result.status).toBe("deleteFailed");
    expect(result.status === "deleteFailed" && result.error).toBeInstanceOf(AuthSessionMissingError);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
