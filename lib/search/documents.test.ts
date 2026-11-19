import { describe, expect, test } from "vitest";
import { toDocument, type PopCardRow } from "./documents";

const row: PopCardRow = {
  id: "c1",
  name: "Charizard",
  card_number: "4/102",
  number_key: "4",
  variant: null,
  rarity: "Rare",
  set_id: "s1",
  set_name: "Base Set",
  set_code: "BS",
  series: null,
  language: "en",
  release_year: 1999,
  category: "pokemon",
  kind: "tcg",
  grade_counts: { g10: 2, g9: 1 },
  authentic_count: 0,
  total: 3,
  autograph_total: 0,
  grades_present: ["g10", "g9"],
  latest_published_at: "2026-11-19T10:00:00Z",
};

describe("toDocument", () => {
  test("maps the row and converts the date to unix seconds", () => {
    const doc = toDocument(row);
    expect(doc).toEqual({
      ...row,
      latest_published_at: 1795082400,
    });
  });

  test("keeps null dates and defaults missing counts", () => {
    const doc = toDocument({ ...row, latest_published_at: null, grade_counts: null });
    expect(doc.latest_published_at).toBeNull();
    expect(doc.grade_counts).toEqual({});
  });
});
