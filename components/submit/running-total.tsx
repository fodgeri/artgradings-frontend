"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { Quote } from "@/lib/orders/types";

/**
 * Side panel from `lg:` up, fixed bottom bar below. `action` is the Next
 * button. Figures are the server's quote; nothing is computed here.
 */
export function RunningTotal({
  quote,
  cardCount,
  action,
}: {
  quote: Quote;
  cardCount: number;
  action?: ReactNode;
}) {
  const t = useTranslations("submit.total");
  const format = useFormatter();
  const total = format.number(quote.totalCents / 100, {
    style: "currency",
    currency: quote.currency,
  });
  const turnaround =
    quote.turnaroundDays === null
      ? t("unknown")
      : t("turnaroundDays", { days: quote.turnaroundDays });

  return (
    <aside
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 py-3 lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-24 lg:self-start lg:rounded-panel lg:border lg:p-6"
    >
      <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-stretch lg:gap-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 lg:grid-cols-1 lg:gap-y-4">
          <div className="col-span-2 lg:col-span-1">
            <dt className="sr-only">{t("title")}</dt>
            <dd className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              {t("cards", { count: cardCount })}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              {t("estimate")}
            </dt>
            <dd className="font-serif text-[24px] font-medium text-ink lg:text-[34px]">
              {total}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              {t("turnaround")}
            </dt>
            <dd className="text-ink">{turnaround}</dd>
          </div>
        </dl>
        {action}
      </div>
    </aside>
  );
}
