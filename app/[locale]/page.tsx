import { getFormatter, getTranslations } from "next-intl/server";

import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import type { SlabData } from "@/components/slab/slab";
import { reportPopError } from "@/lib/pop/errors";
import { loadGrades, loadRecentCopies } from "@/lib/pop/load";
import { SHOWCASE_MIN, toShowcaseSlabs } from "@/lib/pop/showcase";

import { Landing } from "./landing";

// Static with incremental regeneration: the real slabs refresh every five minutes.
export const revalidate = 300;

/** The newest published copies, or the fixtures while there are too few (or anything fails). */
async function loadSlabs(): Promise<SlabData[]> {
  // No Supabase env (CI build): the fixtures stand in, and that is not an error.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return SAMPLE_SLABS;
  }
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
    // The database is down: the fixtures stand in, and staff hear about it.
    reportPopError("landing", "load_failed");
    return SAMPLE_SLABS;
  }
}

export default async function Home() {
  return <Landing slabs={await loadSlabs()} />;
}
