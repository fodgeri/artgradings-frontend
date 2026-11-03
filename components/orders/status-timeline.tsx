import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import type { OrderDetail } from "@/lib/orders/load-orders";
import { JOURNEY, type OrderStatus } from "@/lib/orders/status";

/**
 * The order's journey. A step is reached when the log says so, or when the
 * order has moved past it. Unreached steps are greyed out and `aria-disabled`.
 * A cancelled order shows only what it reached, then cancelled as the end.
 */
export function StatusTimeline({ log, status }: { log: OrderDetail["log"]; status: OrderStatus }) {
  const t = useTranslations("orders");
  const format = useFormatter();

  const when = (step: OrderStatus) => log.find((entry) => entry.toStatus === step)?.createdAt;
  const cancelled = status === "cancelled";
  const current = JOURNEY.indexOf(status);

  const steps: OrderStatus[] = cancelled
    ? [...JOURNEY.filter((step) => when(step) !== undefined), "cancelled"]
    : JOURNEY;

  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {steps.map((step, index) => {
        const at = when(step);
        const reached = cancelled || at !== undefined || index <= current;
        const isCurrent = !cancelled && step === status;
        return (
          <li
            key={step}
            aria-disabled={reached ? undefined : true}
            aria-current={isCurrent || (cancelled && step === "cancelled") ? "step" : undefined}
            className={cn("flex items-baseline justify-between gap-4", reached ? "text-ink" : "text-muted opacity-60")}
          >
            <span className={cn(reached && "font-medium")}>{t(`status.${step}`)}</span>
            {at !== undefined && (
              <time dateTime={new Date(at).toISOString()} className="text-sm text-muted">
                {format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" })}
              </time>
            )}
          </li>
        );
      })}
    </ol>
  );
}
