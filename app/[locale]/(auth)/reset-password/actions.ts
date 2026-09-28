"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { authErrorKey, reportAuthError } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { resetPasswordDetour } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out every OTHER session, then sets a new password for the signed-in
 * user — the session the recovery link just created — so a reset evicts
 * whoever else holds one.
 *
 * Eviction comes first so a failure is retriable: nothing has changed yet,
 * and resubmitting runs both steps again. Done the other way round, a failed
 * eviction could only be reported, and a retry would stop at `same_password`
 * before reaching it — leaving the session the reset was meant to end.
 * Revocation ends refresh tokens; an access token already issued stays valid
 * until it expires (at most `jwt_expiry`, one hour), which is why the page's
 * copy says "within the hour".
 *
 * Only a session minted by an emailed link within the hour may do this (see
 * `isRecoverySession`): any other signed-in session is sent to settings,
 * where changing the password needs the current one and Turnstile. Without
 * that gate, whoever held the owner's session — an unlocked laptop, a stolen
 * cookie — could set a password here with neither and evict the owner.
 *
 * Checks the session itself: a page being protected does not protect the
 * action behind it.
 */
export async function resetPassword(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const detour = resetPasswordDetour(data?.claims);
  if (detour) return redirect({ href: detour, locale: target });

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    reportAuthError(signOutError, "resetPassword");
    return { status: "error", errorKey: "sessionsNotRevoked" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "resetPassword") };

  return redirect({ href: "/account", locale: target });
}
