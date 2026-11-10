import type { ReactNode } from "react";

/**
 * A numbered section of a wizard form: a small gold index, a serif heading
 * and an optional quiet note on the right, above a hairline from the last.
 */
export function FormSection({
  number,
  heading,
  aside,
  children,
}: {
  number: string;
  heading: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-hairline-faint px-5 py-6 first:border-t-0 sm:px-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="font-mono text-[11px] font-medium tracking-[0.14em] text-gold-ink"
        >
          {number}
        </span>
        <h2 className="m-0 font-serif text-h3 text-ink">{heading}</h2>
        {aside && <span className="text-sm ml-auto text-muted">{aside}</span>}
      </div>
      {children}
    </div>
  );
}
