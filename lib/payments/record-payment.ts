import "server-only";

import { reportOrderError } from "@/lib/orders/errors";
import { createAdminClient } from "@/lib/supabase/admin";

import type { PaymentProviderId } from "./provider";

export type PaymentInput = {
  orderId: string;
  provider: PaymentProviderId;
  providerReference: string;
  amountCents: number;
  currency: string;
};

export type PaymentVerdict = "recorded" | "duplicate" | "rejected";

const VERDICTS: readonly string[] = ["recorded", "duplicate", "rejected"];

function args(input: PaymentInput) {
  return {
    p_order_id: input.orderId,
    p_provider: input.provider,
    p_provider_reference: input.providerReference,
    p_amount_cents: input.amountCents,
    // The database compares against the order's upper-case char(3), case-sensitively.
    p_currency: input.currency.toUpperCase(),
  };
}

/**
 * Records a successful charge and, when it matches the order, marks it paid.
 * Idempotent per (provider, providerReference). **This is what M7's webhook
 * calls**; the caller is responsible for having verified the charge.
 *
 * `rejected` means a charge was recorded against an order that could not be
 * marked paid (wrong status, amount or currency). It is reported so staff
 * notice, and still returned.
 */
export async function recordPaymentSuccess(input: PaymentInput): Promise<PaymentVerdict> {
  const { data, error } = await createAdminClient().rpc("record_payment_success", args(input));
  if (error) {
    reportOrderError("recordPayment", error.code ?? "unknown");
    throw new Error("Could not record the payment");
  }
  if (typeof data !== "string" || !VERDICTS.includes(data)) {
    reportOrderError("recordPayment", "unexpected_verdict");
    throw new Error("Could not record the payment");
  }
  if (data === "rejected") reportOrderError("recordPayment", "rejected");
  return data as PaymentVerdict;
}

/** Records a failed attempt. Repeating it is harmless. */
export async function recordPaymentFailure(input: PaymentInput): Promise<void> {
  const { error } = await createAdminClient().rpc("record_payment_failure", args(input));
  if (error) {
    reportOrderError("recordPayment", error.code ?? "unknown");
    throw new Error("Could not record the payment failure");
  }
}
