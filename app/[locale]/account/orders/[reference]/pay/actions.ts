"use server";

import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";
import { getPaymentProvider } from "@/lib/payments/provider";
import { recordPaymentFailure, recordPaymentSuccess } from "@/lib/payments/record-payment";
import { createClient } from "@/lib/supabase/server";

/**
 * The test payment outcome, shared by Pay and Fail. The order is read through
 * the session client, so RLS proves ownership before the admin client is
 * reached; the amount and currency come from that row, never from the browser.
 * The provider reference is deterministic, so a double-click is a `duplicate`.
 * Every outcome lands on the order page.
 */
async function settle(rawLocale: string, reference: string, outcome: "pay" | "fail"): Promise<never> {
  if (getPaymentProvider()?.id !== "fake") notFound();

  const locale = resolveLocale(rawLocale);
  await requireUser({ locale, next: `/account/orders/${reference}/pay` });

  if (typeof reference !== "string" || !ORDER_REFERENCE_PATTERN.test(reference)) notFound();

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, total_cents, currency")
    .eq("reference", reference)
    .maybeSingle();
  if (!order || order.total_cents === null) notFound();

  const input = {
    orderId: order.id,
    provider: "fake",
    providerReference: `fake_${order.id}`,
    amountCents: order.total_cents,
    currency: order.currency,
  } as const;
  if (outcome === "pay") await recordPaymentSuccess(input);
  else await recordPaymentFailure(input);

  return redirect({ href: `/account/orders/${reference}`, locale });
}

export async function payTestOrder(locale: string, reference: string): Promise<never> {
  return settle(locale, reference, "pay");
}

export async function failTestOrder(locale: string, reference: string): Promise<never> {
  return settle(locale, reference, "fail");
}
