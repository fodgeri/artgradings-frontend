"use client";

import { Toggle } from "@base-ui-components/react/toggle";
import { ToggleGroup } from "@base-ui-components/react/toggle-group";

import { cn } from "@/lib/cn";

export type SegmentedOption = { value: string; label: string };

/**
 * A single-select pill group — the design's `.seg`.
 *
 * Base UI's ToggleGroup models value as an ARRAY even with `multiple={false}`,
 * and will hand back an empty array when the pressed item is clicked again.
 * Both are normalised here so callers get a plain always-present string.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        // Empty means the active item was clicked again. A segmented control
        // always has exactly one selection, so ignore it.
        if (next.length > 0) onValueChange(String(next[0]));
      }}
      className={cn("glass inline-flex gap-[3px] rounded-group p-1", className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            "focus-ring cursor-pointer rounded-control border border-transparent px-[18px] py-[9px] text-sm font-medium text-muted transition-colors duration-150",
            "hover:text-ink",
            "data-[pressed]:border-[var(--ag-glass-border)] data-[pressed]:bg-[linear-gradient(180deg,rgb(255_255_255/0.18),rgb(255_255_255/0.06))] data-[pressed]:text-gold-ink",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
