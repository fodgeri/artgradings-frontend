"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { authErrorKey, reportAuthError } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets a new password for the signed-in user — normally the session the
 * recovery link just created — then signs out every OTHER session, so a
 * reset evicts whoever else holds one.
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

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "resetPassword") };

  // The password has changed whatever happens next, so a failure here is
  // reported, not shown.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) reportAuthError(signOutError, "resetPassword");

  return redirect({ href: "/account", locale: target });
}
