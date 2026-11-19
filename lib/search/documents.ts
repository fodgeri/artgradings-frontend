import type { Database } from "@/lib/supabase/database.types";
import type { CategoryKind, GradeKey } from "@/lib/pop/keys";

type Row = Database["public"]["Functions"]["search_card_documents"]["Returns"][number];

// Generated types mark every RETURNS TABLE column non-null; these can be null.
type NullableColumns =
  | "variant"
  | "rarity"
  | "set_code"
  | "series"
  | "release_year"
  | "latest_published_at";

export type PopCardRow = Omit<Row, NullableColumns | "grade_counts" | "kind"> & {
  variant: string | null;
  rarity: string | null;
  set_code: string | null;
  series: string | null;
  release_year: number | null;
  latest_published_at: string | null;
  grade_counts: unknown;
  kind: string;
};

export type PopCardDocument = Omit<
  PopCardRow,
  "latest_published_at" | "grade_counts" | "kind"
> & {
  kind: CategoryKind;
  grade_counts: Partial<Record<GradeKey, number>>;
  /** Unix seconds, so Meilisearch can sort on it. */
  latest_published_at: number | null;
};

function unixSeconds(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export function toDocument(row: PopCardRow): PopCardDocument {
  return {
    ...row,
    kind: row.kind as CategoryKind,
    grade_counts: (row.grade_counts ?? {}) as Partial<Record<GradeKey, number>>,
    latest_published_at: unixSeconds(row.latest_published_at),
  };
}
