// Mirrors the seed rows in supabase/migrations/*_catalog.sql. Placeholders
// until the client confirms the categories and the grade scale.
export const CATEGORY_KEYS = [
  "pokemon",
  "mtg",
  "yugioh",
  "one_piece",
  "basketball",
  "soccer",
  "baseball",
  "american_football",
  "hockey",
] as const;

export const GRADE_KEYS = [
  "g1", "g1_5", "g2", "g2_5", "g3", "g3_5", "g4", "g4_5", "g5", "g5_5",
  "g6", "g6_5", "g7", "g7_5", "g8", "g8_5", "g9", "g9_5", "g10",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type GradeKey = (typeof GRADE_KEYS)[number];
export type CategoryKind = "tcg" | "sports";
