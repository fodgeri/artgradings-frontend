"use client";

import { Switch as BaseSwitch } from "@base-ui-components/react/switch";

import { cn } from "@/lib/cn";

/**
 * The iOS-style toggle from the liquid glass variant.
 *
 * Base UI's `onCheckedChange` is `(checked, eventDetails)`; the second
 * argument is dropped here so callers can pass a plain `setState`.
 *
 * The track is 54x32, under the 44px touch floor in one dimension, so a
 * pseudo-element extends the hit area vertically without changing the visual.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <BaseSwitch.Root
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      className={cn(
        "focus-ring relative h-8 w-[54px] shrink-0 cursor-pointer rounded-full border border-[var(--ag-glass-border)] bg-[var(--ag-glass-bg)] p-0 transition-[background,border-color] duration-200",
        "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        "data-[checked]:border-gold-line data-[checked]:bg-[linear-gradient(180deg,var(--ag-gold-bright),var(--ag-gold))]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block size-[26px] translate-x-0.5 rounded-full bg-[linear-gradient(180deg,#fff,#e6e4dc)] shadow-[0_2px_7px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.9)]",
          "transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.5,1)]",
          "data-[checked]:translate-x-6",
        )}
      />
    </BaseSwitch.Root>
  );
}
