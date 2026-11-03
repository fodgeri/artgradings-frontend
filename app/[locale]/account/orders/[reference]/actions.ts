"use server";

import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { orderErrorKey, reportOrderError, type SaveResult } from "@/lib/orders/errors";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";
import { createClient } from "@/lib/supabase/server";

/**
 * Cancels the caller's own unpaid order. `cancel_order` looks the order up by
 * `auth.uid()`, so a reference that is not theirs is `not_found` and changes
 * nothing. Success, and an order that can no longer be cancelled (a stale tab),
 * both land on the order page, which shows its real state.
 */
export async function cancelOrder(
  rawLocale: string,
  reference: string,
): Promise<SaveResult<never>> {
  if (typeof reference !== "string" || !ORDER_REFERENCE_PATTERN.test(reference)) notFound();

  const locale = resolveLocale(rawLocale);
  await requireUser({ locale, next: `/account/orders/${reference}` });

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_reference: reference });

  if (error) {
    if (error.code === "P0001" && error.message === "transition_not_allowed") {
      return redirect({ href: `/account/orders/${reference}`, locale });
    }
    const errorKey = orderErrorKey(error);
    if (errorKey === "generic") reportOrderError("cancelOrder", error.code ?? "unknown");
    return { ok: false, errorKey };
  }

  return redirect({ href: `/account/orders/${reference}`, locale });
}
