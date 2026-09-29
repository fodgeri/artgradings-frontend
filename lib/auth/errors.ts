import * as Sentry from "@sentry/nextjs";
import type { AuthError } from "@supabase/supabase-js";

import type messages from "@/messages/en.json";

/** Every message under `auth.errors` — the only errors an auth form can show. */
export type AuthErrorKey = keyof (typeof messages)["auth"]["errors"];

/** Which flow failed. Sent to Sentry as a tag. */
export type AuthFlow =
  | "signUp"
  | "resend"
  | "signIn"
  | "forgotPassword"
  | "confirm"
  | "resetPassword"
  | "signOut"
  | "updateName"
  | "changeEmail"
  | "changePassword"
  | "deleteAccount";

/**
 * Supabase `error.code` → message key. Keyed by the stable code, never by
 * `error.message`: messages change between GoTrue releases, and some embed the
 * submitted email address.
 *
 * `otp_expired` is absent on purpose: the confirm action turns any failure
 * into `/sign-in?error=link_expired` rather than an inline error.
 */
export const AUTH_ERROR_KEYS: Readonly<Record<string, AuthErrorKey>> = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  weak_password: "weakPassword",
  captcha_failed: "captchaFailed",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  same_password: "samePassword",
  reauthentication_needed: "reauthenticationNeeded",
  email_address_invalid: "invalidEmail",
};

/**
 * Codes whose appearance depends on whether the address has an account.
 * `over_email_send_rate_limit` is per user: GoTrue only raises it for an
 * address it already knows, inside the resend window. The other two only
 * appear when confirmations are off, and are listed defensively.
 */
const ACCOUNT_REVEALING = new Set([
  "over_email_send_rate_limit",
  "user_already_exists",
  "email_exists",
]);

/**
 * True when showing this error would tell a stranger an account exists.
 * Sign-up, resend and forgot-password treat such errors as success.
 */
export function revealsAccount(error: AuthError): boolean {
  return error.code !== undefined && ACCOUNT_REVEALING.has(error.code);
}

/**
 * Reports an auth failure we did not expect. An action that returns `{error}`
 * instead of throwing is invisible to Sentry unless it reports explicitly.
 *
 * A fresh Error, not the Supabase one: `error.message` can contain the email
 * address, and `sendDefaultPii` being off does not scrub an exception message.
 */
export function reportAuthError(error: AuthError, flow: AuthFlow): void {
  Sentry.captureException(new Error(`Unexpected Supabase Auth error in ${flow}`), {
    tags: {
      "auth.flow": flow,
      "auth.code": error.code ?? "none",
      "auth.status": String(error.status ?? "none"),
      "auth.error": error.name,
    },
  });
}

/**
 * Reports that we suppressed a `revealsAccount()` error to keep enumeration
 * closed. `over_email_send_rate_limit` fires both for the per-address resend
 * window AND for Supabase's project-wide hourly email cap — without this,
 * hitting the cap looks exactly like success (no email sent, nothing in
 * Sentry), which hides a real outage behind the enumeration protection.
 *
 * A message, not an exception: this is not unexpected, and `captureMessage`
 * makes the two easy to tell apart in Sentry. Never the error object, never
 * its message, never form data — only the flow and the code/status tags.
 */
export function reportSuppressedAuthError(error: AuthError, flow: AuthFlow): void {
  Sentry.captureMessage(`Suppressed Supabase Auth error in ${flow}`, {
    level: "warning",
    tags: {
      "auth.flow": flow,
      "auth.code": error.code ?? "none",
      "auth.status": String(error.status ?? "none"),
    },
  });
}

/**
 * Reports a failed profile write. PostgREST errors are not `AuthError`s, so
 * `reportAuthError` does not take them.
 *
 * The Postgres code only — never the message, which for a check-constraint
 * violation names the column and can echo the value.
 */
export function reportProfileError(error: { code?: string; message?: string }, flow: AuthFlow): void {
  Sentry.captureException(new Error(`Unexpected profile error in ${flow}`), {
    tags: { "auth.flow": flow, "db.code": error.code ?? "none" },
  });
}

/** The message key to show for `error`; reports anything unmapped. */
export function authErrorKey(error: AuthError, flow: AuthFlow): AuthErrorKey {
  // Object.hasOwn, not `in` or a bare lookup: `toString` is on the prototype.
  if (error.code !== undefined && Object.hasOwn(AUTH_ERROR_KEYS, error.code)) {
    return AUTH_ERROR_KEYS[error.code];
  }
  reportAuthError(error, flow);
  return "generic";
}
