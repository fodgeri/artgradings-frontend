import { type AuthError, AuthSessionMissingError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteCurrentUserResult =
  /** The account is gone. */
  | { status: "deleted" }
  /** An order is paid and not yet finished; nothing was changed. */
  | { status: "ordersInProgress" }
  /** `prepare_account_deletion` failed or answered something unexpected. */
  | { status: "prepareFailed"; code: string }
  /** The orders were prepared, but the admin API refused the deletion. */
  | { status: "deleteFailed"; error: AuthError };

/**
 * Permanently deletes the SIGNED-IN user: their auth record, identities and
 * sessions, and — by cascade — their profile and role assignments.
 *
 * One of the few files allowed to import the service-role client (see
 * `admin-import-guard.test.ts`). It takes no argument on purpose: the id comes
 * from the verified claims read here, so no caller can hand it someone else's.
 * The caller re-verifies the password first.
 *
 * Two steps, both on the service-role client and both with that id:
 *   1. `prepare_account_deletion(id)` refuses while an order is unfinished,
 *      otherwise deletes the orders that may go and scrubs personal fields
 *      from the ones that stay. It is granted to `service_role` only, so no
 *      session can run it past the password check. Running it twice is safe.
 *   2. only on its `'ok'`, the hard delete — `deleteUser(id)` with no second
 *      argument.
 *
 * Another tab can write orders between the two. A trigger on `auth.users` runs
 * the preparation again inside the deletion's transaction, so such an order is
 * dealt with too; if one became unfinished the deletion fails as `deleteFailed`.
 *
 * Future tables must follow the deletion contract in
 * docs/superpowers/specs/2026-09-28-profile-settings-design.md: nothing new
 * cascades from auth.users.
 */
export async function deleteCurrentUser(): Promise<DeleteCurrentUserResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { status: "deleteFailed", error: new AuthSessionMissingError() };

  const admin = createAdminClient();
  const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_deletion", {
    p_user_id: id,
  });
  // The code only: a database error message can carry personal data.
  if (prepareError) return { status: "prepareFailed", code: prepareError.code ?? "none" };
  if (prepared === "orders_in_progress") return { status: "ordersInProgress" };
  if (prepared !== "ok") return { status: "prepareFailed", code: "unexpected_result" };

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { status: "deleteFailed", error };
  return { status: "deleted" };
}
