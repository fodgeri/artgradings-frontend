"use server";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { authErrorKey, reportSuppressedAuthError, revealsAccount } from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates an account and sends the confirmation email. Registered and
 * unregistered addresses get the same answer — the check-email page — so the
 * form cannot be used to test whether someone has an account.
 *
 * No `emailRedirectTo`: the template builds its link from Site URL, and
 * `/auth/confirm` decides where to go from the link's `type`.
 */
export async function signUp(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error) {
    if (!revealsAccount(error)) {
      return { status: "error", errorKey: authErrorKey(error, "signUp") };
    }
    reportSuppressedAuthError(error, "signUp");
  }

  return redirect({ href: "/sign-up/check-email", locale: resolveLocale(locale) });
}
