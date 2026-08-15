import { cn } from "@/lib/cn";

/**
 * The `Art.` logotype.
 *
 * This is the ONE place `text-gold` is allowed as a text colour. WCAG 1.4.3
 * exempts "text that is part of a logo or brand name" from the contrast
 * minimum, and the gold full stop is a brand mark, not readable copy — it
 * carries no information and is `aria-hidden`. Everywhere else the rule holds:
 * gold text is `text-gold-ink`. `components/gold-ink.test.ts` allowlists this
 * file and only this file.
 *
 * Brand identity and logo design are out of scope per the estimate; this is
 * the design file's own typographic mark.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-baseline font-serif text-[23px] font-medium text-ink",
        className,
      )}
    >
      Art
      <span aria-hidden className="text-gold">
        .
      </span>
    </span>
  );
}
