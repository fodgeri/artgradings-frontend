import { cn } from "@/lib/cn";

import { GradeBadge } from "./grade-badge";

export type SlabData = {
  cert: string;
  category: string;
  name: string;
  year: string;
  set: string;
  grade: string;
  label: string;
  /** Absent until R2 uploads land in M3; the window falls back to the hatch. */
  image?: string;
};

/**
 * The signature object of the brand: a graded card sealed in its holder.
 *
 * Glass in both themes — a frosted white panel on paper, full liquid glass on
 * black — which is what `glass-strong` resolves to per theme.
 */
export function Slab({ data, className }: { data: SlabData; className?: string }) {
  return (
    <div className={cn("glass-strong rounded-card p-[13px]", className)}>
      <div className="flex items-center justify-between px-0.5 pb-[11px]">
        <span className="flex items-center font-mono text-[11px] font-medium tracking-[0.16em] text-ink">
          <span
            aria-hidden
            className="mr-2 inline-block size-1.5 shrink-0 rounded-[1px] bg-gold"
          />
          ART
        </span>
        <span className="font-mono text-meta text-muted">{data.cert}</span>
      </div>

      <div className="relative flex aspect-[5/7] items-center justify-center overflow-hidden rounded-[9px] border border-hairline-faint bg-[repeating-linear-gradient(135deg,var(--ag-surface-sunken),var(--ag-surface-sunken)_9px,var(--ag-surface)_9px,var(--ag-surface)_18px)]">
        {data.image ? (
          // Fixture-only until M3. Swaps to next/image once R2 serves real
          // card scans and we know the loader and the size budget.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            alt={`${data.name}, ${data.year} ${data.set}`}
            className="size-full object-cover"
          />
        ) : (
          <span className="rounded-[5px] bg-surface/85 px-[9px] py-[5px] font-mono text-meta uppercase tracking-[0.2em] text-muted">
            {data.category}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2.5 px-[3px] pb-0.5 pt-[13px]">
        <div>
          <div className="font-serif text-[17px] font-medium leading-[1.1] text-ink">
            {data.name}
          </div>
          <div className="mt-[5px] font-mono text-meta text-muted">
            {data.year} · {data.set}
          </div>
        </div>
        <GradeBadge grade={data.grade} label={data.label} />
      </div>
    </div>
  );
}
