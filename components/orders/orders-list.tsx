import { useFormatter, useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { OrderSummary } from "@/lib/orders/load-orders";

/** The customer's orders, in the order given: the loader puts the draft first. */
export function OrdersList({ orders }: { orders: OrderSummary[] }) {
  const t = useTranslations("orders");
  const format = useFormatter();

  if (orders.length === 0) {
    return <p className="m-0 text-muted">{t("empty")}</p>;
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {orders.map((order) => {
        const isDraft = order.status === "draft";
        const date = format.dateTime(new Date(order.submittedAt ?? order.createdAt), { dateStyle: "medium" });
        return (
          <li key={order.reference}>
            <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-5">
              <div className="min-w-0">
                <p className="m-0 font-mono text-label uppercase text-muted">
                  {isDraft ? t("list.started", { date }) : t("list.placed", { date })}
                </p>
                {!isDraft && <p className="m-0 font-medium text-ink">{order.reference}</p>}
                <p className="m-0 text-sm text-muted">
                  {t("list.cards", { count: order.cardCount })} · <span>{t(`status.${order.status}`)}</span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                {order.totalCents !== null && (
                  <p className="m-0 font-medium text-ink">
                    {format.number(order.totalCents / 100, { style: "currency", currency: order.currency })}
                  </p>
                )}
                <Link
                  href={isDraft ? "/submit" : `/account/orders/${order.reference}`}
                  className={buttonVariants({ variant: isDraft ? "gold" : "ghost" })}
                >
                  {isDraft ? t("list.continue") : t("list.view")}
                </Link>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
