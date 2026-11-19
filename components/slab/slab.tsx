import { Wordmark } from "@/components/layout/wordmark";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

import { GradeBadge } from "./grade-badge";

export type SlabData = {
  /** Absent for a card with no certificate of its own (a card page); nothing renders. */
  cert?: string;
  category: string;
  name: string;
  year: string;
  set: string;
  /** `#004/102`. M3 collects this as the card's "set number". */
  number: string;
  /**
   * On the physical label per the brand manual, but NOT among M3's four
   * required per-card fields (name, set, set number, release year). Optional
   * until the client decides whether the submission form collects it; when
   * absent the line is omitted rather than rendered blank.
   */
  rarity?: string;
  grade: string;
  label: string;
  /** Absent until R2 uploads land in M3; the window falls back to the hatch. */
  image?: string;
  /** When set the whole slab is a link (a real certificate page). Fixtures never set it. */
  href?: string;
};

/**
 * The signature object of the brand: a graded card sealed in its holder.
 *
 * Glass in both themes — a frosted white panel on paper, full liquid glass on
 * black — which is what `glass-strong` resolves to per theme.
 */
export function Slab({ data, className }: { data: SlabData; className?: string }) {
  // `block` and the base come before `className` so a caller's `hidden` wins.
  const classes = cn("glass-strong block rounded-card p-[13px]", data.href && "focus-ring", className);
  const body = (
    <>
      {/* The brand manual's signature device (p. 7) at label scale: a rule
          interrupted at centre by the mark. On the physical holder this is
          the top of the label, above the card window. */}
      <div className="flex items-center gap-2.5 px-0.5 pb-[11px]">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <Wordmark decorative className="h-[11px]" />
        <span aria-hidden className="h-px flex-1 bg-hairline" />
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

      {/* The manual's label splits metadata left, grade right. The left block
          is name / year + set / number / rarity — which is exactly M3's four
          required per-card fields plus rarity, the one field the label wants
          that submission does not yet collect. */}
      <div className="flex items-end justify-between gap-2.5 px-[3px] pb-0.5 pt-[13px]">
        <div className="min-w-0">
          <div className="truncate font-serif text-[17px] font-medium leading-[1.1] text-ink">
            {data.name}
          </div>
          <div className="mt-[5px] font-mono text-meta uppercase text-muted">
            {[data.year, data.set].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-[3px] font-mono text-meta uppercase text-muted">
            <span>{data.number}</span>
            {data.rarity ? (
              <>
                {" · "}
                <span>{data.rarity}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-[7px]">
          <GradeBadge grade={data.grade} label={data.label} />
          {data.cert ? <span className="font-mono text-meta text-muted">{data.cert}</span> : null}
        </div>
      </div>
    </>
  );

  return data.href ? (
    <Link href={data.href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
