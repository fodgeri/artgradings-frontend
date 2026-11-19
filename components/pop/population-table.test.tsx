import { describe, expect, test } from "vitest";

import { GRADE_KEYS } from "@/lib/pop/keys";
import type { Grade, Population } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen, within } from "@/test/i18n";

import { PopulationTable } from "./population-table";

const grades: Grade[] = GRADE_KEYS.map((key, i) => ({ key, value: 1 + i * 0.5 }));
const empty: Population = {
  gradeCounts: {}, authenticCount: 0, total: 0, autographCounts: {}, autographTotal: 0,
};

const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);

describe("PopulationTable", () => {
  test("an authentic-only row has Authentic and Total headers and no grade column", () => {
    renderWithIntl(
      <PopulationTable
        grades={grades}
        caption="c"
        rows={[{ ...empty, id: "a", label: "Card A", authenticCount: 2, total: 2 }]}
      />,
    );
    expect(headers()).toEqual([
      messages.pop.table.card,
      messages.pop.table.authentic,
      messages.pop.table.total,
    ]);
  });

  test("an autograph-only row shows the autograph line and a card total of 0", () => {
    renderWithIntl(
      <PopulationTable
        grades={grades}
        caption="c"
        rows={[
          { ...empty, id: "a", label: "Card A", autographCounts: { g9: 3 }, autographTotal: 3 },
        ]}
      />,
    );
    const rows = screen.getAllByRole("row");
    const line = within(rows[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(line.at(-1)).toBe("0");
    const sub = within(rows[2]);
    expect(sub.getByRole("rowheader").textContent).toBe(messages.pop.table.autograph);
    expect(sub.getAllByRole("cell").map((c) => c.textContent)).toEqual(["3", "3"]);
  });

  test("grade headers run from the highest value down and carry the grade name", () => {
    renderWithIntl(
      <PopulationTable
        grades={grades}
        caption="c"
        rows={[
          { ...empty, id: "a", label: "A", gradeCounts: { g7: 1, g10: 4, g9: 2 }, total: 7 },
        ]}
      />,
    );
    expect(headers().slice(1, -1)).toEqual(["10", "9", "7"]);
    expect(screen.getByTitle(messages.catalog.grades.g10.label)).toBeTruthy();
  });
});
