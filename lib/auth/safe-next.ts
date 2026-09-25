/** Where sign-in lands when no usable `next` was supplied. */
export const DEFAULT_NEXT = "/account";

/**
 * Browsers remove tab, CR and LF from a URL before parsing it, so
 * `/\t/evil.test` becomes `//evil.test`. Any control character, and any
 * backslash (which browsers treat as `/`), rejects the whole value.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns `value` only if it is a path on this origin, otherwise
 * `DEFAULT_NEXT`. The result is a locale-less path — pass it to
 * `redirect({ href, locale })` from `@/i18n/navigation`, which adds the prefix.
 *
 * Without this, `/sign-in?next=//evil.test` is an open redirect that borrows
 * our domain's credibility for a phishing link.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NEXT;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_NEXT;
  if (UNSAFE.test(value)) return DEFAULT_NEXT;
  return value;
}
