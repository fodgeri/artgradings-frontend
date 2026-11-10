import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const STEPS = [
  { key: "cards", href: "/submit" },
  { key: "shipping", href: "/submit/shipping" },
  { key: "summary", href: "/submit/summary" },
  // Shown so the customer sees the whole journey. It is never a link and is
  // never current inside the wizard: payment has its own page.
  { key: "payment", href: null },
] as const;

export type SubmitStep = Exclude<(typeof STEPS)[number]["key"], "payment">;

/**
 * The wizard's journey as numbered circles joined by a line. Completed steps
 * are links back and show a check; later steps are plain: no skipping ahead.
 * Below `sm` only the current step shows its name.
 */
export function StepIndicator({ current }: { current: SubmitStep }) {
  const t = useTranslations("submit.steps");
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label={t("label")}>
      <ol className="m-0 flex max-w-xl list-none items-center gap-2 p-0 sm:gap-3">
        {STEPS.map((step, index) => {
          const label = t(step.key);
          const done = index < currentIndex;
          const active = index === currentIndex;

          const circle = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-[30px] shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-medium transition-colors duration-150",
                active && "border-gold bg-gold text-on-gold",
                done && "border-gold-line bg-gold-soft text-gold-ink",
                !active && !done && "border-hairline bg-surface-raised text-muted",
              )}
            >
              {done ? (
                <svg viewBox="0 0 12 12" fill="none" className="size-3">
                  <path
                    d="M2.5 6.5 5 9l4.5-6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
          );
          const name = (
            <span
              className={cn(
                "text-sm whitespace-nowrap",
                active ? "font-semibold text-ink" : "sr-only text-muted sm:not-sr-only",
              )}
            >
              {label}
            </span>
          );
          const body: ReactNode = (
            <>
              {circle}
              {name}
            </>
          );

          return (
            <li
              key={step.key}
              className={cn("flex items-center gap-2 sm:gap-3", index < STEPS.length - 1 && "flex-1")}
            >
              {done && step.href ? (
                <Link
                  href={step.href}
                  className="focus-ring flex items-center gap-2.5 rounded-full hover:[&>span:last-child]:text-ink hover:[&>span:last-child]:underline"
                >
                  {body}
                </Link>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  className="flex items-center gap-2.5"
                >
                  {body}
                </span>
              )}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn("h-px min-w-4 flex-1", done ? "bg-gold-line" : "bg-hairline")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
