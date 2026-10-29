"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { submitOrder } from "@/app/[locale]/submit/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "@/i18n/navigation";
import type { OrderErrorKey } from "@/lib/orders/errors";
import type { Draft, Quote } from "@/lib/orders/types";

/** Step 3: the server's quote, the contact details and the terms. */
export function SummaryStep({
  draft,
  quote,
  termsHref = "/terms",
}: {
  draft: Draft;
  quote: Quote;
  termsHref?: string;
}) {
  const t = useTranslations("submit");
  const catalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();

  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<OrderErrorKey | null>(null);

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: quote.currency });
  const label = (kind: "services" | "tiers" | "addOns", key: string | null) => {
    if (!key) return "";
    const path = `${kind}.${key}.label` as "services.grading.label";
    return catalog.has(path) ? catalog(path) : key;
  };

  const submit = async () => {
    if (submitting || !accepted) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      // A success redirects, so only a refusal ever comes back here.
      const result = await submitOrder(locale, { termsAccepted: accepted });
      if (result && !result.ok) {
        setErrorKey(result.errorKey);
        setSubmitting(false);
      }
    } catch {
      setErrorKey("generic");
      setSubmitting(false);
    }
  };

  const s = draft.shipping;
  const country =
    s.country === null ? "" : (new Intl.DisplayNames([locale], { type: "region" }).of(s.country) ?? s.country);
  const names = [s.firstName, s.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-4">
      {errorKey && (
        <p role="alert" className="text-sm font-medium text-ink">
          {t(`errors.${errorKey}`)}
        </p>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("summary.cardsHeading")}</h2>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {draft.cards.map((card, index) => {
            const priced = quote.cards.find((q) => q.cardId === card.id);
            return (
              <li key={card.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="m-0 font-mono text-label uppercase text-muted">
                    {t("summary.cardLabel", { number: index + 1 })}
                  </p>
                  <p className="m-0 font-medium text-ink">{card.name?.trim() || t("summary.unknownCard")}</p>
                  {card.setName && <p className="m-0 text-sm text-muted">{card.setName}</p>}
                  <p className="m-0 text-sm text-muted">
                    {t("summary.serviceLine", {
                      service: label("services", card.service),
                      tier: label("tiers", card.tierKey),
                    })}
                  </p>
                  {card.addOnKeys.length > 0 && (
                    <p className="m-0 text-sm text-muted">
                      {t("summary.addOns", { names: card.addOnKeys.map((k) => label("addOns", k)).join(", ") })}
                    </p>
                  )}
                  {priced && priced.identificationCents > 0 && (
                    <p className="m-0 text-sm text-muted">
                      {t("summary.identification")}: {money(priced.identificationCents)}
                    </p>
                  )}
                </div>
                <p className="m-0 font-medium text-ink">{priced ? money(priced.priceCents ?? 0) : ""}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-h3 text-ink">{t("summary.totalsHeading")}</h2>
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
          <dt className="text-muted">{t("summary.subtotal")}</dt>
          <dd className="m-0 text-right text-ink">{money(quote.subtotalCents)}</dd>
          <dt className="text-muted">{t("summary.inbound")}</dt>
          <dd className="m-0 text-right text-ink">{money(quote.inboundCents)}</dd>
          <dt className="text-muted">{t("summary.return")}</dt>
          <dd className="m-0 text-right text-ink">{money(quote.returnCents)}</dd>
          <dt className="font-medium text-ink">
            {t("summary.total")} <span className="text-sm font-normal text-muted">{t("summary.vatIncluded")}</span>
          </dt>
          <dd className="m-0 text-right font-serif text-h3 text-ink" data-testid="summary-total">
            {money(quote.totalCents)}
          </dd>
          <dt className="text-muted">{t("summary.declaredValue")}</dt>
          <dd className="m-0 text-right text-ink">{money(quote.declaredValueTotalCents)}</dd>
          <dt className="text-muted">{t("summary.turnaround")}</dt>
          <dd className="m-0 text-right text-ink">
            {quote.turnaroundDays === null
              ? t("total.unknown")
              : t("summary.turnaroundDays", { days: quote.turnaroundDays })}
          </dd>
        </dl>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="m-0 font-serif text-h3 text-ink">{t("summary.contactHeading")}</h2>
          <Link href="/submit/shipping" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("summary.edit")}
          </Link>
        </div>
        <p className="m-0 text-ink">{names}</p>
        {s.phone && <p className="m-0 text-muted">{s.phone}</p>}
        <p className="m-0 mt-2 text-ink">{t(`shipping.method.${s.method ?? "postal"}`)}</p>
        {s.method === "postal" && (
          <p className="m-0 text-muted">
            {t("summary.address", {
              line: s.addressLine ?? "",
              postcode: s.postcode ?? "",
              city: s.city ?? "",
              country,
            })}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <Checkbox
          checked={accepted}
          disabled={submitting}
          onCheckedChange={setAccepted}
          label={t.rich("summary.terms", {
            link: (chunks) => (
              <Link href={termsHref} className="underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/submit/shipping" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {t("summary.back")}
          </Link>
          <Button type="button" onClick={submit} disabled={!accepted || submitting}>
            {submitting ? t("summary.submitting") : t("summary.submit")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
