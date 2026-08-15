import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Exported so a locale-aware `Link` can look like a button without `Button`
 * needing to be polymorphic:
 *
 *   <Link href="/submit" className={buttonVariants({ variant: "gold" })}>
 */
export const buttonVariants = cva(
  "focus-ring inline-flex items-center justify-center gap-[9px] whitespace-nowrap rounded-control border border-transparent font-sans font-semibold transition-[background,border-color,filter] duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // `gold-fill` carries the flat/gradient split between themes.
        gold: "gold-fill border-black/10 text-on-gold shadow-gold hover:brightness-[1.06]",
        ink: "bg-ink text-surface hover:bg-ink-strong",
        ghost: "glass text-ink hover:border-gold-line",
      },
      size: {
        // The design's exact heights. The touch-target pseudo-element in
        // `Button` keeps the small size usable on a coarse pointer, where
        // 42px is under the 44px floor.
        md: "h-[50px] px-6 text-[15px]",
        sm: "h-[42px] px-[18px] text-sm",
      },
    },
    defaultVariants: { variant: "gold", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        buttonVariants({ variant, size }),
        // Expands the hit area to 44px on touch without changing the visual
        // height, satisfying WCAG 2.5.8 for the small size.
        "relative after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        className,
      )}
      {...props}
    />
  );
}
