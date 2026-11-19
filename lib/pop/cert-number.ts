/**
 * Certificate numbers as people type them: `#art-0883 1204` is `ART-08831204`.
 * Returns null for anything that cannot be a certificate number, so callers
 * never pass hostile or oversized input to the database.
 */
export function normaliseCertNumber(input: string): string | null {
  const value = input.replace(/\s+/g, "").replace(/^#+/, "").toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(value) ? value : null;
}
