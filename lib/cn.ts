import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
