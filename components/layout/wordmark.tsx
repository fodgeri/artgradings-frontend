import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

import { ART_MARK_PATHS, ART_MARK_VIEWBOX } from "./art-mark.svg";

/**
 * The ART logotype, from the brand manual.
 *
 * Monochrome and filled with `currentColor`, so paper, `surface-invert` and
 * the dark theme are one asset and a colour cascade rather than three files —
 * the deck shows the normal and inverse variants as identical geometry (p. 6).
 *
 * The `<title>` is load-bearing, not decoration. `site-header.tsx` renders
 * this as the only child of the home link, so it is that link's entire
 * accessible name; `site-header.test.tsx` asserts it. The previous typographic
 * placeholder supplied that name with a text node and got it for free.
 *
 * This replaces the placeholder wordmark. Brand identity was out of scope per
 * the estimate until the client commissioned the manual; it no longer is.
 */
export function Wordmark({
  className,
  decorative = false,
}: {
  className?: string;
  /**
   * Render the mark as pure decoration — no role, no name.
   *
   * Use it where the mark repeats and something else already carries the
   * meaning: the slab label shows it on every card in a Pop Report grid, so
   * announcing "ART" once per slab is noise on top of the card's own name,
   * cert and grade. The header's mark is never decorative — it is the home
   * link's only child and therefore its entire accessible name.
   */
  decorative?: boolean;
}) {
  const t = useTranslations("a11y");

  return (
    <svg
      viewBox={ART_MARK_VIEWBOX}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      fill="currentColor"
      className={cn("h-[17px] w-auto text-ink", className)}
    >
      {decorative ? null : <title>{t("wordmark")}</title>}
      {ART_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
