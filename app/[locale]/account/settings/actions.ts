"use server";

import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import {
  authErrorKey,
  reportProfileError,
  reportSuppressedAuthError,
  revealsAccount,
} from "@/lib/auth/errors";
import { nameTooLong, normalizeName } from "@/lib/auth/profile-name";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/** Where a signed-out visitor comes back to after signing in. */
const SETTINGS = "/account/settings";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in user's CURRENT address, from Auth rather than the JWT: after
 * an email change completes on another device, this device's claims carry the
 * old address until the next refresh — up to an hour. No address means Auth
 * no longer recognises the session, which is treated as signed out.
 */
async function currentEmail(supabase: ServerClient, locale: Locale): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return redirect({ href: { pathname: "/sign-in", query: { next: SETTINGS } }, locale });
  return email;
}

/**
 * Saves the first and last name. Both optional: blank clears to null, as the
 * database requires. RLS is the boundary — the update is scoped to the
 * verified user id, never an id from the form.
 *
 * The row is read back so that an update matching nothing — how a missing
 * `select` policy fails — is an error rather than a false "saved".
 */
export async function updateName(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireUser({ locale: resolveLocale(locale), next: SETTINGS });

  const firstName = normalizeName(readField(formData, "firstName"));
  const lastName = normalizeName(readField(formData, "lastName"));
  if (nameTooLong(firstName) || nameTooLong(lastName)) {
    return { status: "error", errorKey: "nameTooLong" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", user.id)
    .select("id")
    .single();

  if (error) {
    reportProfileError(error, "updateName");
    return { status: "error", errorKey: "generic" };
  }
  return { status: "sent" };
}

/**
 * Starts an email change. With secure email change on, Supabase mails a link
 * to BOTH addresses and changes nothing until both are clicked — which is why
 * this does not ask for the password: a stolen session cannot click the link
 * in the old inbox.
 *
 * Never reveals whether another account holds the new address. A taken
 * address (`email_exists`) and a free one resubmitted within the resend window
 * (`over_email_send_rate_limit`) both answer "sent"; were they different,
 * submitting an address twice would test whether it is registered.
 */
export async function changeEmail(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const email = readEmail(formData);
  if (!email) return { status: "error", errorKey: "invalidEmail" };

  const supabase = await createClient();
  const current = await currentEmail(supabase, target);
  if (email.toLowerCase() === current.toLowerCase()) {
    return { status: "error", errorKey: "emailUnchanged" };
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    if (!revealsAccount(error)) {
      return { status: "error", errorKey: authErrorKey(error, "changeEmail") };
    }
    reportSuppressedAuthError(error, "changeEmail");
  }
  return { status: "sent" };
}
