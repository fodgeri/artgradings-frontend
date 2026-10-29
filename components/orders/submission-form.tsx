import { useFormatter, useLocale, useTranslations } from "next-intl";

import type { OrderDetail } from "@/lib/orders/load-orders";

import { OrderQr } from "./order-qr";

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-600">{term}</dt>
      <dd className="m-0 text-black">{children}</dd>
    </>
  );
}

/** The form enclosed with the cards: who sent them, what each is, and what was paid. */
export function SubmissionForm({ order, qrSvg }: { order: OrderDetail; qrSvg: string }) {
  const t = useTranslations("orders.printables");
  const catalog = useTranslations("catalog");
  const method = useTranslations("orders.order.method");
  const format = useFormatter();
  const locale = useLocale();

  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: order.currency });
  const label = (kind: "services" | "tiers" | "addOns", key: string | null) => {
    if (!key) return "";
    const path = `${kind}.${key}.label` as "services.grading.label";
    return catalog.has(path) ? catalog(path) : key;
  };
  const language = (code: string) => new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  const country =
    order.address.country === null
      ? ""
      : (new Intl.DisplayNames([locale], { type: "region" }).of(order.address.country) ?? order.address.country);
  const names = [order.contact.firstName, order.contact.lastName].filter(Boolean).join(" ");
  const hasHints = (c: OrderDetail["cards"][number]) =>
    [c.releaseYear, c.brand, c.language, c.name, c.setName, c.cardNumber].some((v) => v !== null && v !== "");
  const cards = [...order.cards].sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-6 bg-white p-6 text-black">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-serif text-h2">{t("formTitle")}</h1>
          <p className="m-0 font-mono text-label uppercase">{t("referenceLabel")}</p>
          <p className="m-0 font-mono text-2xl font-bold tracking-wider">{order.reference}</p>
        </div>
        <OrderQr svg={qrSvg} reference={order.reference} size={120} />
      </header>

      <section>
        <h2 className="mb-2 font-serif text-h3">{t("contactHeading")}</h2>
        <p className="m-0">{names}</p>
        {order.contact.phone && <p className="m-0">{order.contact.phone}</p>}
        {order.shippingMethod && <p className="m-0">{method(order.shippingMethod)}</p>}
        {order.address.line && (
          <p className="m-0">
            {[order.address.line, `${order.address.postcode ?? ""} ${order.address.city ?? ""}`.trim(), country]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-serif text-h3">{t("cardsHeading")}</h2>
        <ol className="m-0 flex list-none flex-col divide-y divide-black/20 p-0">
          {cards.map((card, index) => {
            const addOns = card.addOns.map((a) => a.key).sort().map((k) => label("addOns", k));
            return (
              <li key={card.id} className="break-inside-avoid py-3">
                <p className="m-0 font-mono text-label uppercase">{t("cardLabel", { number: index + 1 })}</p>
                <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {card.identifiedBy === "art" && (
                    <>
                      <dt className="col-span-2 font-medium">{t("artIdentifies")}</dt>
                      {card.identificationCents !== null && (
                        <Row term={t("identification")}>{money(card.identificationCents)}</Row>
                      )}
                      {hasHints(card) && <dt className="col-span-2 text-neutral-600">{t("hints")}</dt>}
                    </>
                  )}
                  {card.releaseYear !== null && <Row term={t("year")}>{card.releaseYear}</Row>}
                  {card.brand && <Row term={t("brand")}>{card.brand}</Row>}
                  {card.language && <Row term={t("language")}>{language(card.language)}</Row>}
                  {card.name && <Row term={t("name")}>{card.name}</Row>}
                  {card.setName && <Row term={t("set")}>{card.setName}</Row>}
                  {card.cardNumber && <Row term={t("cardNumber")}>{card.cardNumber}</Row>}
                  {card.surface && <Row term={t("surface")}>{card.surface}</Row>}
                  <Row term={t("signed")}>{card.signed ? t("yes") : t("no")}</Row>
                  <Row term={t("numbered")}>{card.numbered ? t("yes") : t("no")}</Row>
                  <Row term={t("service")}>{label("services", card.service)}</Row>
                  <Row term={t("tier")}>{label("tiers", card.tierKey)}</Row>
                  <Row term={t("addOns")}>{addOns.length > 0 ? addOns.join(", ") : t("none")}</Row>
                  {card.declaredValueCents !== null && (
                    <Row term={t("declaredValue")}>{money(card.declaredValueCents)}</Row>
                  )}
                </dl>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 font-serif text-h3">{t("summaryHeading")}</h2>
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{t("cardCount", { count: cards.length })}</dt>
          <dd className="m-0" />
          {order.declaredValueTotalCents !== null && (
            <>
              <dt>{t("totalDeclared")}</dt>
              <dd className="m-0 text-right" data-testid="declared-total">
                {money(order.declaredValueTotalCents)}
              </dd>
            </>
          )}
          {order.subtotalCents !== null && (
            <>
              <dt>{t("subtotal")}</dt>
              <dd className="m-0 text-right">{money(order.subtotalCents)}</dd>
            </>
          )}
          {order.inboundCents !== null && (
            <>
              <dt>{t("inbound")}</dt>
              <dd className="m-0 text-right">{money(order.inboundCents)}</dd>
            </>
          )}
          {order.returnCents !== null && (
            <>
              <dt>{t("return")}</dt>
              <dd className="m-0 text-right">{money(order.returnCents)}</dd>
            </>
          )}
          {order.totalCents !== null && (
            <>
              <dt className="font-medium">{t("totalPaid")}</dt>
              <dd className="m-0 text-right font-medium" data-testid="total-paid">
                {money(order.totalCents)}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-serif text-h3">{t("packingHeading")}</h2>
        <p className="m-0">{t("packing")}</p>
      </section>
    </div>
  );
}
