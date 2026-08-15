import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A single rule-bounded figure: big serif numeral over a mono caption. */
export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("py-[26px] pr-1", className)}>
      <div className="font-serif text-[34px] font-medium tracking-[-0.01em] text-ink">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
    </div>
  );
}

/**
 * The horizontal rule-bounded row of figures under the hero.
 *
 * The design is a flex row at 1180px only. Below `md` that squeezes four
 * numerals into unreadable columns, so it becomes a 2x2 grid first.
 */
export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 border-y border-hairline md:flex md:gap-0",
        "[&>*]:md:flex-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
