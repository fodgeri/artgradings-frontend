import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "shrink-0 rounded-[8px] border border-gold-line bg-gold-soft text-center",
  {
    variants: {
      size: {
        md: "px-[11px] py-[7px]",
        lg: "px-[15px] py-[10px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const numberSize = { md: "text-[30px]", lg: "text-[40px]" } as const;

/**
 * The grade numeral and its wording. Split out from `Slab` because the M4
 * Pop Report renders grade distributions without the slab frame.
 */
export function GradeBadge({
  grade,
  label,
  size = "md",
  className,
}: {
  grade: string;
  label: string;
  className?: string;
} & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ size }), className)}>
      <div
        className={cn(
          "font-serif font-semibold leading-[0.9] text-ink",
          numberSize[size ?? "md"],
        )}
      >
        {grade}
      </div>
      <div className="mt-1 font-mono text-[8px] font-medium tracking-[0.12em] text-gold-ink">
        {label}
      </div>
    </div>
  );
}
