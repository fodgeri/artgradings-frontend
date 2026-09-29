import { type AuthError, AuthSessionMissingError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Permanently deletes the SIGNED-IN user: their auth record, identities and
 * sessions, and — by cascade — their profile and role assignments.
 *
 * The only file allowed to import the service-role client (see
 * `admin-import-guard.test.ts`). It takes no argument on purpose: the id comes
 * from the verified claims read here, so no caller can hand it someone else's.
 *
 * A hard delete — `deleteUser(id)` with no second argument. Future tables must
 * follow the deletion contract in
 * docs/superpowers/specs/2026-09-28-profile-settings-design.md: nothing new
 * cascades from auth.users.
 */
export async function deleteCurrentUser(): Promise<{ error: AuthError | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { error: new AuthSessionMissingError() };

  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  return { error };
}
