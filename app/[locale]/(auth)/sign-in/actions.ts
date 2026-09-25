"use server";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { authErrorKey } from "@/lib/auth/errors";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs in and returns to `next`, or `/account`. Every credential failure is
 * the same message — never which of email or password was wrong.
 *
 * The password policy is NOT applied here: it governs new passwords, and an
 * existing one must keep working if the policy ever tightens.
 */
export async function signIn(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  const password = readField(formData, "password");
  if (!email || !password) return { status: "error", errorKey: "invalidCredentials" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error) return { status: "error", errorKey: authErrorKey(error, "signIn") };

  return redirect({ href: safeNext(formData.get("next")), locale: resolveLocale(locale) });
}
