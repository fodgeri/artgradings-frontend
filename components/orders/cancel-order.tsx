"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/lib/orders/errors";
import type { OrderStatus } from "@/lib/orders/status";

/** Cancel, offered only while the order is unpaid. A success redirects, so only a refusal returns. */
export function CancelOrder({
  reference,
  status,
  cancel,
}: {
  reference: string;
  status: OrderStatus;
  cancel: (locale: string, reference: string) => Promise<SaveResult<never>>;
}) {
  const t = useTranslations("orders.order");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (status !== "draft" && status !== "awaiting_payment") return null;

  const run = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await cancel(locale, reference);
      if (result && !result.ok) {
        setFailed(true);
        setPending(false);
      }
    } catch {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {failed && (
        <p role="alert" className="m-0 text-sm font-medium text-ink">
          {t("cancelError")}
        </p>
      )}
      <Button type="button" variant="ghost" disabled={pending} aria-busy={pending} onClick={run}>
        {pending ? t("cancelling") : t("cancel")}
      </Button>
    </div>
  );
}
