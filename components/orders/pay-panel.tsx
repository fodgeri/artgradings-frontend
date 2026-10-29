"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";

type Action = (locale: string, reference: string) => Promise<never>;

/**
 * The test payment controls. One flag disables all three while an action is
 * in flight, so a double-click cannot send two requests (the server is
 * idempotent too). A successful action redirects, so only a failure returns.
 */
export function PayPanel({
  reference,
  totalCents,
  currency,
  pay,
  fail,
}: {
  reference: string;
  totalCents: number;
  currency: string;
  pay: Action;
  fail: Action;
}) {
  const t = useTranslations("orders.pay");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (action: Action) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await action(locale, reference);
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-[560px] p-6 sm:p-10">
      <h1 className="font-serif text-h2 text-ink">{t("panelTitle")}</h1>
      <p className="mt-3 text-muted">{t("lead")}</p>
      <p className="mt-6 text-ink">
        {t("total")}:{" "}
        <strong>{format.number(totalCents / 100, { style: "currency", currency })}</strong>
      </p>
      {failed && (
        <p role="alert" className="mt-4 text-sm font-medium text-ink">
          {t("error")}
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3" aria-busy={pending}>
        <Button type="button" variant="gold" disabled={pending} onClick={() => run(pay)}>
          {pending ? t("working") : t("pay")}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(fail)}>
          {t("fail")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push(`/account/orders/${reference}`)}
        >
          {t("cancel")}
        </Button>
      </div>
    </Card>
  );
}
