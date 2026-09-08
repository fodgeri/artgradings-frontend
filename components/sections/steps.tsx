import { useTranslations } from "next-intl";

import { GasShield } from "@/components/layout/gas-shield";
import { cn } from "@/lib/cn";

export type Step = { number: string; title: string; body: string };

/**
 * The process grid, rendered on both the landing page and `/how-it-works`.
 *
 * Takes its content as a prop rather than reading messages directly, because
 * the two routes show different slices of the same array — the difference
 * between them is data, not a flag.
 *
 * The design draws the internal rules as a background showing through a 1px
 * grid gap. Ported as `gap-px` on a `bg-hairline` wrapper with opaque children,
 * which themes itself: `--ag-hairline` is redeclared in the dark block, so no
 * `dark:` class is needed.
 */
export function Steps({ items, className }: { items: Step[]; className?: string }) {
  const t = useTranslations("home");

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-panel bg-hairline md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {items.map((step, index) => {
        // The last step is the one where the card is sealed, which is where
        // the inert gas fill belongs. Keyed off position rather than a message
        // id so translations cannot silently detach the note from its step.
        const isSealStep = index === items.length - 1;

        return (
          <div
            key={step.number}
            className="flex min-h-[230px] flex-col bg-surface p-7"
          >
            <span className="font-mono text-label text-gold-ink">{step.number}</span>
            <h3 className="mt-4 font-serif text-h3 text-ink">{step.title}</h3>
            <p className="mt-3 text-sm leading-[1.65] text-muted">{step.body}</p>

            {isSealStep ? (
              <span className="mt-auto flex items-start gap-2 pt-5 text-sm text-muted">
                <GasShield className="mt-0.5 size-4 text-gold-ink" />
                {t("gasFill")}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
