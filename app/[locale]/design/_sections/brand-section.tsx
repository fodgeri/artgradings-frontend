import { GasShield } from "@/components/layout/gas-shield";
import { Wordmark } from "@/components/layout/wordmark";

/**
 * The brand marks, in every context they have to survive.
 *
 * The mark is one monochrome asset filled with `currentColor`, so paper,
 * `surface-invert` and the dark theme are a colour cascade rather than three
 * files. Rendering all three side by side is the cheapest way to catch a
 * regression in that arrangement.
 */
export function BrandSection() {
  return (
    <div>
      <h2 className="font-serif text-h2 text-ink">Brand</h2>
      <p className="mt-2 max-w-prose text-lead text-muted">
        Vector geometry from the brand manual. One asset per mark, filled with{" "}
        <code className="font-mono text-[0.9em]">currentColor</code> — switch the theme
        in the header to check the inverse rendering.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-card border border-hairline bg-surface-raised p-8">
          <Wordmark className="h-8" />
          <p className="mt-6 font-mono text-label">On surface</p>
        </div>

        <div className="surface-invert rounded-card p-8">
          <Wordmark className="h-8" />
          <p className="mt-6 font-mono text-label">On surface-invert</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-8">
        <span className="flex items-center gap-2 text-ink">
          <GasShield className="size-5 text-gold-ink" />
          <span className="font-mono text-label">Gas fill — feature icon, not a brand</span>
        </span>
        <Wordmark className="h-3" />
        <Wordmark className="h-6" />
        <Wordmark className="h-10" />
      </div>
    </div>
  );
}
