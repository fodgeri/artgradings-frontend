import { getFormatter, getTranslations } from "next-intl/server";

import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import type { SlabData } from "@/components/slab/slab";
import { loadGrades, loadRecentCopies } from "@/lib/pop/load";
import { SHOWCASE_MIN, toShowcaseSlabs } from "@/lib/pop/showcase";

import { Landing } from "./landing";

// Static with incremental regeneration: the real slabs refresh every five minutes.
export const revalidate = 300;

/** The newest published copies, or the fixtures while there are too few (or anything fails). */
async function loadSlabs(): Promise<SlabData[]> {
  try {
    const [copies, grades] = await Promise.all([loadRecentCopies(SHOWCASE_MIN), loadGrades()]);
    const [grade, category, format] = await Promise.all([
      getTranslations("catalog.grades"),
      getTranslations("catalog.categories"),
      getFormatter(),
    ]);
    return (
      toShowcaseSlabs(
        copies,
        grades,
        (key) => grade(`${key}.label`),
        (key) => category(`${key}.label` as never),
        (value) => format.number(value, { minimumFractionDigits: 0, maximumFractionDigits: 1 }),
      ) ?? SAMPLE_SLABS
    );
  } catch {
    // Missing env at build time, or the database is down: the fixtures stand in.
    return SAMPLE_SLABS;
  }
}

export default async function Home() {
  return <Landing slabs={await loadSlabs()} />;
}
