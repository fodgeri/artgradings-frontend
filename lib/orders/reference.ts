/** Crockford base32 (no I, L, O, U), matching `private.new_order_reference`. */
export const ORDER_REFERENCE_PATTERN = /^AG-[0-9A-HJKMNP-TV-Z]{8}$/;

/** The short path printed on labels and QR codes. It never changes once printed. */
export function orderPath(reference: string): string {
  return `/o/${reference}`;
}
