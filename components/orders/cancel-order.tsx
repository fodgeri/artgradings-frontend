"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/lib/orders/errors";
import type { OrderStatus } from "@/lib/orders/status";

/**
 * Cancel, offered only while the order is unpaid. Cancelling cannot be undone,
 * so the first click only asks; the action runs on the confirmation. A
 * success redirects, so only a refusal returns.
 */
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
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  // The Cancel button is gone once the question shows; keep focus on the safe choice.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  if (status !== "draft" && status !== "awaiting_payment") return null;

  const refused = () => {
    setFailed(true);
    setPending(false);
    setConfirming(false);
  };

  const run = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await cancel(locale, reference);
      if (result && !result.ok) refused();
    } catch {
      refused();
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {failed && (
        <p role="alert" className="m-0 text-sm font-medium text-ink">
          {t("cancelError")}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-col items-start gap-3" aria-busy={pending}>
          <p className="m-0 text-sm font-medium text-ink">{t("cancelConfirm")}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="ghost" disabled={pending} onClick={run}>
              {pending ? t("cancelling") : t("cancelConfirmYes")}
            </Button>
            <Button
              ref={keepRef}
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("cancelKeep")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setFailed(false);
            setConfirming(true);
          }}
        >
          {t("cancel")}
        </Button>
      )}
    </div>
  );
}
