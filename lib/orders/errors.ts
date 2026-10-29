import * as Sentry from "@sentry/nextjs";

export type OrderErrorKey =
  | "notFound"
  | "notDraft"
  | "incomplete"
  | "serviceUnavailable"
  | "tierUnavailable"
  | "addOnUnavailable"
  | "overCap"
  | "countryUnsupported"
  | "tooManyCards"
  | "cardGone"
  | "photoTooLarge"
  | "photoType"
  | "photoLimit"
  | "termsRequired"
  | "generic";

export type OrderFlow =
  | "saveCard"
  | "removeCard"
  | "saveShipping"
  | "uploadPhoto"
  | "removePhoto"
  | "submitOrder"
  | "cancelOrder"
  | "payTest"
  | "recordPayment"
  | "maintenance";

/** The exact message of a `raise exception ... errcode 'P0001'` → copy key. */
const DB_MESSAGES: Readonly<Record<string, OrderErrorKey>> = {
  not_found: "notFound",
  not_draft: "notDraft",
  incomplete: "incomplete",
  service_unavailable: "serviceUnavailable",
  tier_unavailable: "tierUnavailable",
  add_on_unavailable: "addOnUnavailable",
  declared_value_over_cap: "overCap",
  country_unsupported: "countryUnsupported",
  too_many_cards: "tooManyCards",
  card_gone: "cardGone",
  photo_too_large: "photoTooLarge",
  photo_type: "photoType",
  photo_limit: "photoLimit",
  terms_required: "termsRequired",
};

/**
 * Only `P0001` (our own `raise exception`) is mapped, and only by exact
 * message: any other error, whatever it says, is `generic`.
 */
export function orderErrorKey(error: { code?: string; message?: string } | null): OrderErrorKey {
  if (!error || error.code !== "P0001" || error.message === undefined) return "generic";
  return Object.hasOwn(DB_MESSAGES, error.message) ? DB_MESSAGES[error.message] : "generic";
}

/**
 * Reports a caught-and-returned order error. Carries the flow and the
 * database code only — never names, addresses, phone numbers or form data.
 */
export function reportOrderError(flow: OrderFlow, code: string): void {
  Sentry.captureException(new Error(`Order error in ${flow}`), {
    tags: { "order.flow": flow, "order.code": code },
  });
}

export type SaveResult<T> = { ok: true; data: T } | { ok: false; errorKey: OrderErrorKey };
