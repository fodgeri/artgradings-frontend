import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const STEPS = [
  { key: "cards", href: "/submit" },
  { key: "shipping", href: "/submit/shipping" },
  { key: "summary", href: "/submit/summary" },
] as const;

export type SubmitStep = (typeof STEPS)[number]["key"];

/** The wizard's three steps. Only earlier steps are links: no skipping ahead. */
export function StepIndicator({ current }: { current: SubmitStep }) {
  const t = useTranslations("submit.steps");
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <nav aria-label={t("label")}>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em]">
        {STEPS.map((step, index) => {
          const label = t(step.key);
          const number = (
            <span aria-hidden="true" className="mr-1.5">
              {index + 1}
            </span>
          );
          return (
            <li key={step.key} className="flex items-center gap-3">
              {index < currentIndex ? (
                <Link
                  href={step.href}
                  className="text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {number}
                  {label}
                </Link>
              ) : (
                <span
                  aria-current={index === currentIndex ? "step" : undefined}
                  className={cn(
                    index === currentIndex
                      ? "border-b border-gold pb-0.5 text-ink"
                      : "text-muted",
                  )}
                >
                  {number}
                  {label}
                </span>
              )}
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className="text-hairline">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
