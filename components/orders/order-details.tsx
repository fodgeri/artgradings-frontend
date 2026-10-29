import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import type { OrderDetail } from "@/lib/orders/load-orders";

/** The submitted order as the customer sees it: cards, price lines, contact and delivery. */
export function OrderDetails({ order }: { order: OrderDetail }) {
  const t = useTranslations("orders.order");
  const catalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: order.currency });
  const label = (kind: "services" | "tiers" | "addOns", key: string | null) => {
    if (!key) return "";
    const path = `${kind}.${key}.label` as "services.grading.label";
    return catalog.has(path) ? catalog(path) : key;
  };

  const country =
    order.address.country === null
      ? ""
      : (new Intl.DisplayNames([locale], { type: "region" }).of(order.address.country) ?? order.address.country);
  const names = [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("cardsHeading")}</h2>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {order.cards.map((card, index) => (
            <li key={card.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="m-0 font-mono text-label uppercase text-muted">{t("cardLabel", { number: index + 1 })}</p>
                <p className="m-0 font-medium text-ink">{card.name?.trim() || t("unknownCard")}</p>
                {card.setName && <p className="m-0 text-sm text-muted">{card.setName}</p>}
                <p className="m-0 text-sm text-muted">
                  {t("serviceLine", { service: label("services", card.service), tier: label("tiers", card.tierKey) })}
                </p>
                {card.addOns.length > 0 && (
                  <p className="m-0 text-sm text-muted">
                    {t("addOns", { names: card.addOns.map((a) => label("addOns", a.key)).join(", ") })}
                  </p>
                )}
                {card.identificationCents ? (
                  <p className="m-0 text-sm text-muted">
                    {t("identification")}: {money(card.identificationCents)}
                  </p>
                ) : null}
              </div>
              {card.priceCents !== null && <p className="m-0 font-medium text-ink">{money(card.priceCents)}</p>}
            </li>
          ))}
        </ul>
      </Card>

      {order.totalCents !== null && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 font-serif text-h3 text-ink">{t("totalsHeading")}</h2>
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
            {order.subtotalCents !== null && (
              <>
                <dt className="text-muted">{t("subtotal")}</dt>
                <dd className="m-0 text-right text-ink">{money(order.subtotalCents)}</dd>
              </>
            )}
            {order.inboundCents !== null && (
              <>
                <dt className="text-muted">{t("inbound")}</dt>
                <dd className="m-0 text-right text-ink">{money(order.inboundCents)}</dd>
              </>
            )}
            {order.returnCents !== null && (
              <>
                <dt className="text-muted">{t("return")}</dt>
                <dd className="m-0 text-right text-ink">{money(order.returnCents)}</dd>
              </>
            )}
            <dt className="font-medium text-ink">{t("total")}</dt>
            <dd className="m-0 text-right font-serif text-h3 text-ink" data-testid="order-total">
              {money(order.totalCents)}
            </dd>
            {order.declaredValueTotalCents !== null && (
              <>
                <dt className="text-muted">{t("declaredValue")}</dt>
                <dd className="m-0 text-right text-ink">{money(order.declaredValueTotalCents)}</dd>
              </>
            )}
            {order.turnaroundDays !== null && (
              <>
                <dt className="text-muted">{t("turnaround")}</dt>
                <dd className="m-0 text-right text-ink">{t("turnaroundDays", { days: order.turnaroundDays })}</dd>
              </>
            )}
          </dl>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("shippingHeading")}</h2>
        <p className="m-0 text-ink">{names}</p>
        {order.contact.phone && <p className="m-0 text-muted">{order.contact.phone}</p>}
        {order.shippingMethod && <p className="m-0 mt-2 text-ink">{t(`method.${order.shippingMethod}`)}</p>}
        {order.shippingMethod === "postal" && (
          <p className="m-0 text-muted">
            {t("address", {
              line: order.address.line ?? "",
              postcode: order.address.postcode ?? "",
              city: order.address.city ?? "",
              country,
            })}
          </p>
        )}
      </Card>
    </div>
  );
}
