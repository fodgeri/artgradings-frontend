import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { CancelOrder } from "@/components/orders/cancel-order";
import { NextAction } from "@/components/orders/next-action";
import { OrderDetails } from "@/components/orders/order-details";
import { StatusTimeline } from "@/components/orders/status-timeline";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { requireUser } from "@/lib/auth/require-user";
import { loadOrder } from "@/lib/orders/load-orders";
import { nextAction } from "@/lib/orders/next-action";
import { ORDER_REFERENCE_PATTERN } from "@/lib/orders/reference";
import { getPaymentProvider } from "@/lib/payments/provider";
import { createClient } from "@/lib/supabase/server";

import { cancelOrder } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders.order");
  return { title: t("title", { reference: "" }).trim(), description: t("metaDescription"), robots: { index: false } };
}

/** One order: its status, cards, delivery details and what to do next. 404 unless it is the caller's. */
export default async function OrderPage({ params }: PageProps<"/[locale]/account/orders/[reference]">) {
  const { locale: rawLocale, reference } = await params;
  const locale = resolveLocale(rawLocale);
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();
  const user = await requireUser({ locale, next: `/account/orders/${reference}` });

  const supabase = await createClient();
  const order = await loadOrder(supabase, reference, user.id);
  if (!order) notFound();

  const t = await getTranslations("orders");
  const format = await getFormatter();
  const isDraft = order.status === "draft";
  const action = nextAction(order, { payment: getPaymentProvider() !== null });

  return (
    <Section>
      <Container>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <Link href="/account" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("order.back")}
          </Link>
          <div>
            <h1 className="font-serif text-h2 text-ink">{t("order.title", { reference: order.reference })}</h1>
            <p className="mt-2 text-muted">
              {t(`status.${order.status}`)}
              {order.submittedAt &&
                ` · ${t("list.placed", { date: format.dateTime(new Date(order.submittedAt), { dateStyle: "medium" }) })}`}
            </p>
          </div>

          {isDraft ? (
            <Card className="flex flex-col items-start gap-4 p-5 sm:p-6">
              <p className="m-0 text-muted">{t("order.draftLead")}</p>
              <Link href="/submit" className={buttonVariants({ variant: "gold" })}>
                {t("order.continue")}
              </Link>
            </Card>
          ) : (
            <>
              <NextAction reference={order.reference} action={action} />
              <Card className="p-5 sm:p-6">
                <h2 className="mb-3 font-serif text-h3 text-ink">{t("order.timelineHeading")}</h2>
                <StatusTimeline log={order.log} status={order.status} />
              </Card>
              <OrderDetails order={order} />
            </>
          )}

          <CancelOrder reference={order.reference} status={order.status} cancel={cancelOrder} />
        </div>
      </Container>
    </Section>
  );
}
