import { describe, expect, test } from "vitest";

import type { GradeKey } from "./keys";
import { SHOWCASE_MIN, toShowcaseSlabs } from "./showcase";
import type { Grade, PopRecentCopy } from "./types";

const grades: Grade[] = [
  { key: "g10", value: 10 },
  { key: "g9_5", value: 9.5 },
];

function copy(i: number, grade: GradeKey = "g9_5"): PopRecentCopy {
  return {
    certNumber: `ART-0000000${i}`,
    cardId: `c${i}`,
    cardName: `Card ${i}`,
    cardNumber: `${i}/102`,
    variant: null,
    rarity: i % 2 ? "Rare" : null,
    setName: "Base Set",
    category: "pokemon",
    releaseYear: 1999,
    cardGrade: grade,
    publishedAt: "2026-11-19T10:00:00Z",
  };
}

const label = (key: GradeKey) => `label:${key}`;
const category = (key: string) => `cat:${key}`;

describe("toShowcaseSlabs", () => {
  test("returns null below the minimum", () => {
    const copies = Array.from({ length: SHOWCASE_MIN - 1 }, (_, i) => copy(i));
    expect(toShowcaseSlabs(copies, grades, label, category)).toBeNull();
  });

  test("maps enough copies to slabs linked to their certificate", () => {
    const copies = Array.from({ length: SHOWCASE_MIN }, (_, i) => copy(i, i === 0 ? "g10" : "g9_5"));
    const slabs = toShowcaseSlabs(copies, grades, label, category)!;

    expect(slabs).toHaveLength(SHOWCASE_MIN);
    expect(slabs[0]).toMatchObject({
      cert: "ART-00000000",
      href: "/cert/ART-00000000",
      name: "Card 0",
      set: "Base Set",
      year: "1999",
      grade: "10",
      label: "label:g10",
      category: "cat:pokemon",
    });
    expect(slabs[1].grade).toBe("9.5");
    expect(slabs[1].rarity).toBe("Rare");
    expect(slabs[0].rarity).toBeUndefined();
  });

  test("returns null when a grade is unknown to the scale", () => {
    const copies = Array.from({ length: SHOWCASE_MIN }, (_, i) => copy(i, "g1"));
    expect(toShowcaseSlabs(copies, grades, label, category)).toBeNull();
  });
});
