/**
 * The password policy, per NIST SP 800-63B: a minimum length and nothing else
 * — no composition rules. Supabase's leaked-password check (HaveIBeenPwned)
 * is enabled on the hosted project once it is on the Pro plan.
 *
 * These constants are the single source for the action check, the inputs'
 * `minLength`, and the messages' `{min}`/`{max}`. `supabase/config.toml`'s
 * `minimum_password_length` mirrors the minimum and must change with it.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * bcrypt hashes only the first 72 BYTES and ignores the rest, silently — two
 * passwords sharing a 72-byte prefix would both work. Rejecting longer ones is
 * the only way to make that impossible.
 */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = "passwordTooShort" | "passwordTooLong";

export function passwordProblem(password: string): PasswordProblem | null {
  // Array.from splits by code point, so an emoji counts as one character.
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return "passwordTooShort";
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "passwordTooLong";
  }
  return null;
}
