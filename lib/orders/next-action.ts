import type { OrderDetail } from "./load-orders";
import type { OrderStatus } from "./status";

export type NextActionKind = { kind: "pay" } | { kind: "ship" } | { kind: "bringIn" } | { kind: "none" };

/** What the customer should do next, given what is configured on this host. */
export function nextAction(
  order: Pick<OrderDetail, "status" | "shippingMethod">,
  providers: { payment: boolean },
): NextActionKind {
  if (order.status === "awaiting_payment" && providers.payment) return { kind: "pay" };
  if (order.status === "paid") {
    return order.shippingMethod === "in_person" ? { kind: "bringIn" } : { kind: "ship" };
  }
  return { kind: "none" };
}

/** The label and form are printable once the order is paid, and stay so to the end. */
export function printablesAvailable(status: OrderStatus): boolean {
  return status !== "draft" && status !== "awaiting_payment" && status !== "cancelled";
}
