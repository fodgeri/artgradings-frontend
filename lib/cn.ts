import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be taught our custom scales, because it resolves
 * conflicts by parsing class NAMES — it never sees `globals.css`.
 *
 * Left untaught it guesses, and it guesses wrong in a way that is silent and
 * destructive: `text-eyebrow` looks like a text COLOUR to it, so
 * `cn("text-eyebrow", "text-gold-ink")` returned just `text-gold-ink` and the
 * font size vanished. Every custom type size would have been stripped from
 * any element that also set a colour.
 *
 * Anything added to the `--text-*`, `--radius-*` or `--container-*` namespaces
 * in `app/globals.css` must be added here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h2", "h3", "lead", "eyebrow", "kicker", "label", "meta"] },
      ],
      rounded: [{ rounded: ["control", "group", "card", "panel"] }],
      "max-w": [{ "max-w": ["page"] }],
    },
  },
});

/**
 * Composes class names, with later Tailwind utilities beating earlier
 * conflicting ones.
 *
 * Every component in this design system takes a `className` and merges it
 * LAST, so a caller can always override a default without `!important` and
 * without the outcome depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
