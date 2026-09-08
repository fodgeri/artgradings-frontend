import { cn } from "@/lib/cn";

import { GAS_SHIELD_PATH, GAS_SHIELD_VIEWBOX } from "./art-mark.svg";

/**
 * The gas-fill shield.
 *
 * "GAS PROTECT" on the physical holder is a **product feature** — the slab is
 * filled with inert gas to preserve the card — not a sub-brand and not a
 * partner. So this is a feature icon: it belongs beside the copy that explains
 * the gas fill, and never as a lockup in the header or footer.
 *
 * `aria-hidden` by default. The icon carries no information the adjacent copy
 * does not; announcing it twice is worse than not announcing it. Callers that
 * use it without visible copy must supply their own accessible name.
 */
export function GasShield({ className }: { className?: string }) {
  return (
    <svg
      viewBox={GAS_SHIELD_VIEWBOX}
      aria-hidden
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
    >
      <path d={GAS_SHIELD_PATH} />
    </svg>
  );
}
