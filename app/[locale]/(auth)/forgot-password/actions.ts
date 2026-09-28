"use server";

import { type AuthFormState, readEmail, readField } from "@/lib/auth/action-state";
import { authErrorKey, reportSuppressedAuthError, revealsAccount } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Emails a recovery link. The answer is "if an account exists, we've sent a
 * link" whether or not one does. No `redirectTo`: the recovery template links
 * to `/auth/confirm?type=recovery`, which lands on `/reset-password`.
 */
export async function requestPasswordReset(
  _locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken: readField(formData, "captchaToken"),
  });

  if (error) {
    if (!revealsAccount(error)) {
      return { status: "error", errorKey: authErrorKey(error, "forgotPassword") };
    }
    reportSuppressedAuthError(error, "forgotPassword");
  }

  return { status: "sent" };
}
