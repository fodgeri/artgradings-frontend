export const POP_INDEX = "pop_cards";

export const POP_INDEX_SETTINGS = {
  searchableAttributes: ["name", "set_name", "card_number", "variant", "series", "set_code"],
  filterableAttributes: ["category", "kind", "set_id", "release_year", "language", "grades_present"],
  sortableAttributes: ["total", "latest_published_at", "release_year"],
  typoTolerance: { disableOnNumbers: true },
};
