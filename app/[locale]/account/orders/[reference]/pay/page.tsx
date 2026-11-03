import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PayPanel } from "@/components/orders/pay-panel";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";
import { getPaymentProvider } from "@/lib/payments/provider";
import { createClient } from "@/lib/supabase/server";

import { failTestOrder, payTestOrder } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders.pay");
  return { title: t("title"), description: t("metaDescription"), robots: { index: false } };
}

/** The stand-in for a payment provider; 404 unless `PAYMENT_PROVIDER=fake`. */
export default async function PayPage({
  params,
}: PageProps<"/[locale]/account/orders/[reference]/pay">) {
  if (getPaymentProvider()?.id !== "fake") notFound();

  const { locale: rawLocale, reference } = await params;
  const locale = resolveLocale(rawLocale);
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();
  const user = await requireUser({ locale, next: `/account/orders/${reference}/pay` });

  // The session client: RLS proves the order is the caller's.
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("status, total_cents, currency")
    .eq("reference", reference)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) notFound();
  if (order.status !== "awaiting_payment" || order.total_cents === null) {
    return redirect({ href: `/account/orders/${reference}`, locale });
  }

  return (
    <Section>
      <Container>
        <PayPanel
          reference={reference}
          totalCents={order.total_cents}
          currency={order.currency}
          pay={payTestOrder}
          fail={failTestOrder}
        />
      </Container>
    </Section>
  );
}
