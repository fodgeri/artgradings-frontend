export const ORDER_STATUSES = [
  "draft",
  "awaiting_payment",
  "paid",
  "received",
  "grading",
  "graded",
  "shipped_back",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The customer-visible journey: every status but draft and cancelled, in order. */
export const JOURNEY: OrderStatus[] = ORDER_STATUSES.filter(
  (s) => s !== "draft" && s !== "cancelled",
);

/** Statuses in which an account cannot be deleted. */
export const DELETION_BLOCKING: OrderStatus[] = [
  "paid",
  "received",
  "grading",
  "graded",
  "shipped_back",
];
