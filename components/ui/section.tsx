import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A page band. `invert` swaps the role tokens locally via `surface-invert`,
 * so everything nested inside themes correctly without a single `dark:` class.
 */
export function Section({
  invert = false,
  id,
  className,
  children,
}: {
  invert?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("section-y", invert && "surface-invert", className)}>
      {children}
    </section>
  );
}
