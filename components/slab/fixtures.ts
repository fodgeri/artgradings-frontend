import type { SlabData } from "./slab";

/**
 * Gallery-only sample data, lifted from the design file.
 *
 * NOT business data. Grades, certificate numbers and the grading scale itself
 * are client-supplied per CLAUDE.md; nothing here may be rendered on a public
 * page or treated as a real record.
 */
export const SAMPLE_SLABS: SlabData[] = [
  { grade: "10", label: "GEM MINT", name: "Charizard", year: "1999", set: "Base · Holo", cert: "ART-08831204", category: "TCG" },
  { grade: "9.5", label: "MINT+", name: "Michael Jordan", year: "1986", set: "Fleer #57", cert: "ART-08830417", category: "Sports" },
  { grade: "10", label: "GEM MINT", name: "Pikachu", year: "1998", set: "Promo · Holo", cert: "ART-08827781", category: "TCG" },
  { grade: "9", label: "MINT", name: "LeBron James", year: "2003", set: "Topps Chrome", cert: "ART-08826650", category: "Sports" },
];
