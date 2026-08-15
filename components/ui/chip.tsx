import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A pill tag — order numbers, category markers. */
export function Chip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-2 rounded-full px-3.5 py-[7px] font-mono text-[11px] tracking-[0.1em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
