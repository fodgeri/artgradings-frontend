import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** The 1180px measure the whole design is laid out against. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-page px-[var(--ag-gutter)]", className)}
    >
      {children}
    </div>
  );
}
