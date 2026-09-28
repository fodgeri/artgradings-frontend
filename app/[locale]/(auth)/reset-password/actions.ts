"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { authErrorKey, reportAuthError } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out every OTHER session, then sets a new password for the signed-in
 * user — normally the session the recovery link just created — so a reset
 * evicts whoever else holds one.
 *
 * Eviction comes first so a failure is retriable: nothing has changed yet,
 * and resubmitting runs both steps again. Done the other way round, a failed
 * eviction could only be reported, and a retry would stop at `same_password`
 * before reaching it — leaving the session the reset was meant to end.
 * Revocation ends refresh tokens; an access token already issued stays valid
 * until it expires (at most `jwt_expiry`, one hour), which is why the page's
 * copy says "within the hour".
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

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return redirect({ href: "/forgot-password", locale: target });

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    reportAuthError(signOutError, "resetPassword");
    return { status: "error", errorKey: "sessionsNotRevoked" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "resetPassword") };

  return redirect({ href: "/account", locale: target });
}
