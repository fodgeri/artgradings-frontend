import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A muted mono label — smaller and quieter than Eyebrow, and not gold. */
export function Kicker({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("font-mono text-kicker uppercase text-muted", className)}>
      {children}
    </div>
  );
}
