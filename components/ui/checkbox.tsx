"use client";

import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { type ReactNode, useId } from "react";

import { cn } from "@/lib/cn";

/**
 * A labelled, controlled checkbox. There is deliberately no default-checked
 * prop, so a pre-ticked paid add-on cannot be written by accident.
 *
 * Base UI's `onCheckedChange` is `(checked, eventDetails)`; the second
 * argument is dropped so callers can pass a plain `setState`.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;

  return (
    <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      <BaseCheckbox.Root
        aria-labelledby={labelId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next)}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "focus-ring relative mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-hairline bg-surface p-0 transition-colors duration-150",
          "after:absolute after:-inset-3 after:content-['']",
          "data-[checked]:border-gold-line data-[checked]:bg-gold",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <BaseCheckbox.Indicator className="text-on-gold">
          <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
            <path
              d="M2.5 6.5 5 9l4.5-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <div className="min-w-0">
        <span
          id={labelId}
          className={cn("text-sm block font-medium text-ink", disabled && "opacity-50")}
        >
          {label}
        </span>
        {description ? (
          <span id={descId} className="text-sm block text-muted">
            {description}
          </span>
        ) : null}
      </div>
    </label>
  );
}
