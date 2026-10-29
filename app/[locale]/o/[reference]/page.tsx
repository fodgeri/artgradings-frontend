import { notFound } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";

/**
 * The short URL printed on every parcel label and form (`orderPath()`). It
 * NEVER changes: once a label is printed it cannot be recalled. Today it hands
 * the customer to their order page, which shows the order to its owner and 404s
 * for anyone else. M5 routes staff to intake from here instead.
 */
export default async function ShortOrderPage({ params }: PageProps<"/[locale]/o/[reference]">) {
  const { locale: rawLocale, reference } = await params;
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();

  return redirect({ href: `/account/orders/${reference}`, locale: resolveLocale(rawLocale) });
}
