import type { Settings } from "meilisearch";

import { POP_MAX_PAGE, POP_PAGE_SIZE } from "@/lib/pop/search-params";

export const POP_INDEX = "pop_cards";

export const POP_INDEX_SETTINGS: Settings = {
  searchableAttributes: ["name", "set_name", "card_number", "variant", "series", "set_code"],
  filterableAttributes: ["category", "kind", "set_id", "release_year", "language", "grades_present"],
  sortableAttributes: ["total", "latest_published_at", "release_year"],
  // Meilisearch caps totalHits at 1000 by default; the pager reaches page POP_MAX_PAGE.
  pagination: { maxTotalHits: POP_PAGE_SIZE * POP_MAX_PAGE },
  typoTolerance: { disableOnNumbers: true },
};
