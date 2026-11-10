"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";

import { cn } from "@/lib/cn";
import type { Quote } from "@/lib/orders/types";

export type OrderLine = {
  id: string;
  title: string;
  /** "Service · level", or null while nothing is chosen. */
  detail: string | null;
};

export type OrderTodo = {
  id: string;
  label: string;
  onSelect: () => void;
};

const MAX_TODOS = 3;

/**
 * The order panel: a sticky side panel from `lg:` up, a bar fixed to the
 * bottom below, whose details open in place. `action` is the Next button and
 * is rendered once. Figures are the quote's; nothing is priced here.
 *
 * A card's line shows its service and extras; ART identification is its own
 * line, so a total made only of that fee is explained. The total is a dash
 * only while nothing costs anything — never a misleading €0.00.
 */
export function RunningTotal({
  quote,
  cardCount,
  lines = [],
  shipping = "later",
  todos = [],
  action,
}: {
  quote: Quote;
  cardCount: number;
  lines?: OrderLine[];
  /** `later` on the cards step; `fees` once the shipping step can quote them. */
  shipping?: "later" | "fees";
  todos?: OrderTodo[];
  action?: ReactNode;
}) {
  const t = useTranslations("submit.total");
  const format = useFormatter();
  const detailsId = useId();
  const [open, setOpen] = useState(false);

  const money = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: quote.currency });

  const nothingPriced = quote.totalCents === 0 && quote.cards.every((c) => c.priceCents === null);
  const total = nothingPriced ? t("unknown") : money(quote.totalCents);
  const turnaround =
    quote.turnaroundDays === null
      ? t("unknown")
      : t("turnaroundDays", { days: quote.turnaroundDays });
  const identificationCents = quote.cards.reduce((sum, c) => sum + c.identificationCents, 0);
  const shippingCents = quote.inboundCents + quote.returnCents;

  const row = "flex items-start justify-between gap-3 border-b border-hairline-faint py-2.5";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-muted";

  return (
    <aside
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-30 max-h-[80vh] overflow-y-auto border-t border-hairline bg-surface-raised px-4 py-3 lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-24 lg:max-h-none lg:self-start lg:overflow-visible lg:rounded-panel lg:border lg:p-6 lg:shadow-card"
    >
      <div id={detailsId} className={cn("pb-3 lg:block lg:pb-0", open ? "block" : "hidden")}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn("m-0", label)}>{t("title")}</p>
          <p className={cn("m-0", label)}>{t("cards", { count: cardCount })}</p>
        </div>
        <ul className="m-0 mt-1 list-none p-0">
          {lines.map((line) => {
            const priced = quote.cards.find((c) => c.cardId === line.id);
            const cents =
              priced && priced.priceCents !== null
                ? priced.priceCents - priced.identificationCents
                : null;
            return (
              <li key={line.id} className={row}>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{line.title}</span>
                  {line.detail && <span className="text-sm block text-muted">{line.detail}</span>}
                </span>
                <span className="shrink-0 text-ink">{cents === null ? t("unknown") : money(cents)}</span>
              </li>
            );
          })}
          {identificationCents > 0 && (
            <li className={row}>
              <span className="text-sm text-muted">{t("identification")}</span>
              <span className="shrink-0 text-ink">{money(identificationCents)}</span>
            </li>
          )}
          <li className={row}>
            <span className="text-sm text-muted">{t("shipping")}</span>
            {shipping === "later" ? (
              <span className="text-sm text-muted">{t("shippingLater")}</span>
            ) : (
              <span className="shrink-0 text-ink">
                {shippingCents === 0 ? t("unknown") : money(shippingCents)}
              </span>
            )}
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-3 lg:mt-4 lg:flex-col lg:items-stretch lg:gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cn("m-0 hidden lg:block", label)}>{t("estimate")}</p>
            <p
              className="m-0 font-serif text-[24px] font-medium leading-tight text-ink lg:text-[32px]"
              data-testid="order-total"
            >
              {total}
            </p>
          </div>
          <p className="text-sm m-0 text-muted">
            <span className="hidden lg:inline">{t("turnaround")}: </span>
            <span>{turnaround}</span>
          </p>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
            className="focus-ring text-sm -ml-1 mt-0.5 cursor-pointer rounded-control px-1 py-1 font-medium text-ink underline underline-offset-4 lg:hidden"
          >
            {open ? t("hideDetails") : t("showDetails")}
          </button>
        </div>
        <div className="shrink-0 lg:shrink">{action}</div>
      </div>

      {todos.length > 0 && (
        <div className={cn("text-sm mt-3 text-muted lg:block", open ? "block" : "hidden")}>
          <p className="m-0">{t("todo", { count: todos.length })}</p>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {todos.slice(0, MAX_TODOS).map((todo) => (
              <li key={todo.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    todo.onSelect();
                  }}
                  className="focus-ring cursor-pointer rounded-control text-left font-medium text-ink underline underline-offset-4"
                >
                  {todo.label}
                </button>
              </li>
            ))}
            {todos.length > MAX_TODOS && (
              <li>{t("todoMore", { count: todos.length - MAX_TODOS })}</li>
            )}
          </ul>
        </div>
      )}
    </aside>
  );
}
