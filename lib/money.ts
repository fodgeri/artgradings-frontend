import { DECLARED_VALUE_MAX_CENTS } from "@/lib/orders/card-rules";

/** The only currency today. Money is integer minor units plus an ISO 4217 code. */
export const DEFAULT_CURRENCY = "EUR";

const CURRENCY_SYMBOLS = /[\s€$£¥]/g;
const MAX_DIGITS = 15;

/**
 * Parses an amount the way people type it into cents, or null.
 *
 * Whitespace and currency symbols are stripped. When both `.` and `,` appear
 * the last one is the decimal separator and the other groups thousands. A
 * lone separator followed by exactly three digits is a thousands separator
 * ("1,234" and "1.234" are both 1234); followed by one or two digits it is a
 * decimal. More than two decimals, signs, exponents, letters, zero and
 * anything over `DECLARED_VALUE_MAX_CENTS` are rejected.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(CURRENCY_SYMBOLS, "");
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const dots = count(s, ".");
  const commas = count(s, ",");
  let whole: string;
  let fraction = "";

  if (dots + commas === 0) {
    whole = s;
  } else if (dots > 0 && commas > 0) {
    const at = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    const decimal = s[at];
    const grouping = decimal === "." ? "," : ".";
    whole = groupedDigits(s.slice(0, at), grouping) ?? "";
    fraction = s.slice(at + 1);
    if (whole === "" || !/^[0-9]{1,2}$/.test(fraction)) return null;
  } else {
    const sep = dots > 0 ? "." : ",";
    const at = s.lastIndexOf(sep);
    const tail = s.slice(at + 1);
    if (dots + commas > 1) {
      // Repeated: only thousands groups are possible.
      whole = groupedDigits(s, sep) ?? "";
      if (whole === "") return null;
    } else if (/^[0-9]{3}$/.test(tail)) {
      whole = groupedDigits(s, sep) ?? "";
      if (whole === "") return null;
    } else if (/^[0-9]{1,2}$/.test(tail)) {
      whole = s.slice(0, at);
      fraction = tail;
      if (!/^[0-9]+$/.test(whole)) return null;
    } else {
      return null;
    }
  }

  if (whole.length + fraction.length > MAX_DIGITS) return null;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > DECLARED_VALUE_MAX_CENTS) return null;
  return cents;
}

function count(s: string, char: string): number {
  return s.split(char).length - 1;
}

/** "1.234.567" with "." → "1234567"; null unless it is 1–3 digits then groups of exactly 3. */
function groupedDigits(s: string, sep: string): string | null {
  const parts = s.split(sep);
  const [first, ...rest] = parts;
  if (!/^[0-9]{1,3}$/.test(first)) {
    // A plain run of digits is fine when nothing was grouped.
    return parts.length === 1 && /^[0-9]+$/.test(first) ? first : null;
  }
  return rest.every((p) => /^[0-9]{3}$/.test(p)) ? parts.join("") : null;
}
