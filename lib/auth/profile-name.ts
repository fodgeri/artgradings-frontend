/**
 * The name rule. The single source for the action check, the inputs'
 * `maxLength`, and the `{nameMax}` message interpolation. The migration's
 * `profiles_*_name_length` checks mirror it and must change with it.
 *
 * A guard against abuse, not a naming rule: nothing here decides what a
 * valid name looks like.
 */
export const NAME_MAX_LENGTH = 100;

/** Trimmed, or null when nothing is left — absent is null, never "". */
export function normalizeName(raw: string): string | null {
  const name = raw.trim();
  return name === "" ? null : name;
}

export function nameTooLong(name: string | null): boolean {
  // Array.from splits by code point, matching Postgres char_length.
  return name !== null && Array.from(name).length > NAME_MAX_LENGTH;
}
