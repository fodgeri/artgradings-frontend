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
export function Wordmark({ className }: { className?: string }) {
  const t = useTranslations("a11y");

  return (
    <svg
      viewBox={ART_MARK_VIEWBOX}
      role="img"
      fill="currentColor"
      className={cn("h-[17px] w-auto text-ink", className)}
    >
      <title>{t("wordmark")}</title>
      {ART_MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
