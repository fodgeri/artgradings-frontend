import type { SlabData } from "@/components/slab/slab";

import type { GradeKey } from "./keys";
import type { Grade, PopRecentCopy } from "./types";

/** Fewer real copies than this and the landing keeps its fixture slabs. */
export const SHOWCASE_MIN = 8;

/**
 * Maps the most recently published copies to landing slabs, each linking to its
 * certificate page. Returns `null` when there are too few (or a grade is not on
 * the scale) so the caller falls back to the fixtures.
 */
export function toShowcaseSlabs(
  copies: PopRecentCopy[],
  grades: Grade[],
  label: (key: GradeKey) => string,
  category: (key: string) => string,
  numeral: (value: number) => string = String,
): SlabData[] | null {
  if (copies.length < SHOWCASE_MIN) return null;

  const slabs: SlabData[] = [];
  for (const copy of copies) {
    const grade = grades.find((g) => g.key === copy.cardGrade);
    if (!grade) return null;

    slabs.push({
      cert: copy.certNumber,
      href: `/cert/${copy.certNumber}`,
      category: category(copy.category),
      name: copy.cardName,
      year: copy.releaseYear === null ? "" : String(copy.releaseYear),
      set: copy.setName,
      number: copy.cardNumber,
      ...(copy.rarity ? { rarity: copy.rarity } : {}),
      grade: numeral(grade.value),
      label: label(copy.cardGrade),
    });
  }
  return slabs;
}
