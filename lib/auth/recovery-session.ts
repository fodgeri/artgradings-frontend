import type { JwtPayload } from "@supabase/supabase-js";

/**
 * How long after an emailed link was verified its session may still set a
 * password without knowing the current one: the hour the recovery link itself
 * is valid for (`otp_expiry`), which is also `jwt_expiry`.
 */
export const RECOVERY_WINDOW_SECONDS = 60 * 60;

/**
 * Whether these verified claims belong to a session minted by an emailed link
 * within the last `RECOVERY_WINDOW_SECONDS` — the only kind of session that may
 * use /reset-password.
 *
 * GoTrue records EVERY verified email link as `amr: [{method: "otp"}]`:
 * recovery, sign-up confirmation, email change and magic link alike (observed
 * on v2.196; the full notes are in the profile-settings spec). So this cannot
 * tell a recovery link from the others — and need not: each proves control of
 * the account's inbox, which is exactly the authority a recovery link grants,
 * since anyone with that inbox can request one. What it does rule out is the
 * spec's threat — a session held by someone WITHOUT the inbox (an unlocked
 * laptop, a stolen cookie) setting a password with no current password.
 *
 * The entry and its timestamp are signed by Auth, so unlike a marker cookie
 * the holder of a stolen session cannot forge them. A refresh keeps the
 * original timestamp, so the window cannot be extended by refreshing.
 */
export function isRecoverySession(
  claims: Pick<JwtPayload, "amr"> | undefined,
  now: number = Date.now(),
): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;

  const nowSeconds = Math.floor(now / 1000);
  return amr.some(
    (entry) =>
      typeof entry === "object" &&
      entry.method === "otp" &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS,
  );
}

/**
 * Where a visitor to /reset-password is sent instead of the form, or null to
 * show it: no session asks for a link; any session that is not a fresh
 * recovery one changes its password in settings, where the current password
 * and Turnstile are required.
 */
export function resetPasswordDetour(
  claims: Pick<JwtPayload, "amr"> | undefined,
  now: number = Date.now(),
): "/forgot-password" | "/account/settings" | null {
  if (!claims) return "/forgot-password";
  if (!isRecoverySession(claims, now)) return "/account/settings";
  return null;
}
