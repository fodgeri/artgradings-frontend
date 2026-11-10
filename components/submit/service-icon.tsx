import type { ReactNode } from "react";

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A loupe over a check: condition grading. */
const loupe = (
  <>
    <circle cx="10.5" cy="10.5" r="6" {...stroke} />
    <path d="M15 15l5 5M8 10.5l2 2 3-3.5" {...stroke} />
  </>
);

/** A seal with a check: the card is genuine. */
const seal = (
  <>
    <path
      d="M12 3l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.5.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 20l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.5 2.2-1.6.8-2.6 2.7.1z"
      {...stroke}
    />
    <path d="M9 11.8l2 2 4-4.3" {...stroke} />
  </>
);

/** A pen nib: the signature. */
const pen = <path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 013 3L8.5 18 4 20zM14 6.5l3 3" {...stroke} />;

/** A loupe and a pen stroke: grading plus the signature. */
const loupeAndPen = (
  <>
    <circle cx="9.5" cy="9.5" r="5.5" {...stroke} />
    <path d="M13.5 13.5l2.5 2.5M14 21l1-3 5-5a1.4 1.4 0 012 2l-5 5-3 1z" {...stroke} />
  </>
);

/** Anything the catalog adds before an icon is drawn for it. */
const fallback = (
  <>
    <rect x="6" y="3.5" width="12" height="17" rx="2" {...stroke} />
    <path d="M9.5 8h5M9.5 12h5" {...stroke} />
  </>
);

/**
 * Services are catalog data, so this is a lookup with a neutral default, never
 * an exhaustive switch: a new service row must not need a code change to
 * render. The shield is deliberately absent — it belongs to the gas-fill
 * feature alone.
 */
const ICONS: Readonly<Record<string, ReactNode>> = {
  grading: loupe,
  authentication: seal,
  autograph: pen,
  dual: loupeAndPen,
};

export function ServiceIcon({ service }: { service: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[22px]" aria-hidden="true">
      {Object.hasOwn(ICONS, service) ? ICONS[service] : fallback}
    </svg>
  );
}
