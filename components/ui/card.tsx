import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-card", {
  variants: {
    variant: {
      solid: "border border-hairline bg-surface-raised shadow-card",
      // `glass` already carries its own background, border and inset
      // highlight, so it must not be combined with bg-surface-raised.
      glass: "glass",
    },
  },
  defaultVariants: { variant: "solid" },
});

export function Card({
  variant,
  className,
  children,
}: VariantProps<typeof cardVariants> & {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(cardVariants({ variant }), className)}>{children}</div>;
}
