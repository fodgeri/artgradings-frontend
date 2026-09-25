"use server";

import { type AuthFormState, readEmail, readField } from "@/lib/auth/action-state";
import { authErrorKey, reportSuppressedAuthError, revealsAccount } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the confirmation email again. Always reports "sent" unless the
 * failure says nothing about the address (a failed captcha, an IP rate
 * limit). The address is typed again rather than carried in the URL, which
 * would write it into access logs, history and Sentry breadcrumbs.
 */
export async function resendConfirmation(
  _locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (error) {
    if (!revealsAccount(error)) {
      return { status: "error", errorKey: authErrorKey(error, "resend") };
    }
    reportSuppressedAuthError(error, "resend");
  }

  return { status: "sent" };
}
