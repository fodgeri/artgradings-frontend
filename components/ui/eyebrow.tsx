import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The gold-dot label above a heading. Uses `text-gold-ink`, never `text-gold`:
 * at 12px the decorative gold measures 3.13:1 on paper and fails WCAG AA.
 */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center font-mono text-eyebrow uppercase text-gold-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className="mr-2 inline-block size-1.5 shrink-0 rounded-[1px] bg-gold"
      />
      {children}
    </div>
  );
}
