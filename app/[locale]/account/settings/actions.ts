"use server";

import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import {
  type AuthFormState,
  readEmail,
  readField,
  resolveLocale,
} from "@/lib/auth/action-state";
import { deleteCurrentUser } from "@/lib/auth/delete-current-user";
import { endLocalSession } from "@/lib/auth/end-local-session";
import {
  type AuthFlow,
  authErrorKey,
  reportAuthError,
  reportProfileError,
  reportSuppressedAuthError,
  revealsAccount,
} from "@/lib/auth/errors";
import { passwordProblem } from "@/lib/auth/password";
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
 * Re-verifies the current password by signing in with it — Turnstile
 * included, since sign-in requires it. Returns an error state, or null when
 * the password is right.
 *
 * Signing in also mints a fresh session on `supabase`, which is what secure
 * password change's 24-hour rule asks for; no separate reauthenticate step.
 */
async function verifyCurrentPassword(
  supabase: ServerClient,
  formData: FormData,
  flow: AuthFlow,
  locale: Locale,
): Promise<AuthFormState | null> {
  const password = readField(formData, "currentPassword");
  if (!password) return { status: "error", errorKey: "currentPasswordIncorrect" };

  const email = await currentEmail(supabase, locale);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: readField(formData, "captchaToken") },
  });

  if (!error) return null;
  if (error.code === "invalid_credentials") {
    return { status: "error", errorKey: "currentPasswordIncorrect" };
  }
  return { status: "error", errorKey: authErrorKey(error, flow) };
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
 * Never reveals ON SCREEN whether another account holds the new address. A
 * taken address (`email_exists`) and a free one resubmitted within the resend
 * window (`over_email_send_rate_limit`) both answer "sent"; were they
 * different, submitting an address twice would test whether it is registered.
 * The requester's own inbox still differs — Supabase mails it only for a free
 * address — an accepted residual risk described in the profile-settings spec.
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

/**
 * Changes the password of a signed-in user who knows the current one.
 *
 * Other sessions are evicted BEFORE the change, as on /reset-password: done
 * afterwards, a failed eviction could only be reported, and a retry would stop
 * at `same_password` before reaching it. Supabase sends the password-changed
 * email itself.
 *
 * A new password equal to the current one is refused up front, so a no-op
 * change never evicts anyone.
 */
export async function changePassword(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const password = readField(formData, "password");
  const problem = passwordProblem(password);
  if (problem) return { status: "error", errorKey: problem };
  // Caught here, not left to Supabase's `same_password`: that arrives only
  // after the eviction below, and would sign other devices out for nothing.
  if (password === readField(formData, "currentPassword")) {
    return { status: "error", errorKey: "samePassword" };
  }

  const supabase = await createClient();
  const refused = await verifyCurrentPassword(supabase, formData, "changePassword", target);
  if (refused) return refused;

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    reportAuthError(signOutError, "changePassword");
    return { status: "error", errorKey: "sessionsNotRevoked" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", errorKey: authErrorKey(error, "changePassword") };

  return { status: "sent" };
}

/**
 * Permanently deletes the signed-in user's account, after re-verifying the
 * password.
 *
 * Nothing changes until `deleteCurrentUser` succeeds, so a failure leaves the
 * account and this session intact and a retry is safe. Only then is this
 * browser's session ended — auth-js tolerates the revoked token a deleted
 * user now holds.
 *
 * M3 adds a check here: deletion is refused while the user has an unfinished
 * order (the deletion contract in the profile-settings spec).
 */
export async function deleteAccount(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  await requireUser({ locale: target, next: SETTINGS });

  const supabase = await createClient();
  const refused = await verifyCurrentPassword(supabase, formData, "deleteAccount", target);
  if (refused) return refused;

  const { error } = await deleteCurrentUser();
  if (error) {
    reportAuthError(error, "deleteAccount");
    return { status: "error", errorKey: "generic" };
  }

  await endLocalSession(supabase, "deleteAccount");
  return redirect({ href: "/account-deleted", locale: target });
}
