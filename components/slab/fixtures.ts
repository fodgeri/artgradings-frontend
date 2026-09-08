import type { SlabData } from "./slab";

/**
 * Placeholder card data, rendered publicly.
 *
 * **This is not a real record of any card, grade or certificate.** Every name,
 * certificate number and grade below is invented for layout purposes.
 *
 * The design system spec said fixtures would never reach a public page. The
 * landing page spec (`2026-09-01-landing-page-design.md`, Data) deliberately
 * reversed that: the Pop Report and its schema are M4, M0 shipped only the auth
 * foundation with no cards table of any kind, and designing `graded_cards` from
 * a landing page's needs would mean designing it twice — M4's version must also
 * serve population counts, Meilisearch sync and a detail page.
 *
 * These are replaced by real data at M4 through a single prop:
 *
 *     <Showcase cards={SAMPLE_SLABS} />        // M1, here
 *     <Showcase cards={await getTrending()} /> // M4, same SlabData[]
 *
 * `rarity` is absent on several entries on purpose — it is optional on the
 * label, so both branches need to stay exercised.
 */
export const SAMPLE_SLABS: SlabData[] = [
  { grade: "10", label: "GEM MINT", name: "Charizard", year: "1999", set: "Base · Holo", number: "#004/102", rarity: "HOLO RARE", cert: "ART-08831204", category: "TCG" },
  { grade: "9.5", label: "MINT+", name: "Michael Jordan", year: "1986", set: "Fleer #57", number: "#57", rarity: "BASE", cert: "ART-08830417", category: "Sports" },
  { grade: "10", label: "GEM MINT", name: "Pikachu", year: "1998", set: "Promo · Holo", number: "#001/018", cert: "ART-08827781", category: "TCG" },
  { grade: "9", label: "MINT", name: "LeBron James", year: "2003", set: "Topps Chrome", number: "#111", cert: "ART-08826650", category: "Sports" },
  { grade: "9.5", label: "MINT+", name: "Black Lotus", year: "1993", set: "Alpha", number: "#232/295", rarity: "RARE", cert: "ART-08825118", category: "TCG" },
  { grade: "8.5", label: "NM-MT+", name: "Wayne Gretzky", year: "1979", set: "O-Pee-Chee", number: "#18", cert: "ART-08824903", category: "Sports" },
  { grade: "10", label: "GEM MINT", name: "Umbreon", year: "2022", set: "Evolving Skies", number: "#215/203", rarity: "ALT ART", cert: "ART-08823772", category: "TCG" },
  { grade: "9", label: "MINT", name: "Tom Brady", year: "2000", set: "Bowman Chrome", number: "#236", cert: "ART-08822641", category: "Sports" },
];
