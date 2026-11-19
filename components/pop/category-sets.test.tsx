import { describe, expect, test } from "vitest";

import type { PopSetSummary } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { CategorySets } from "./category-sets";

const set = (o: Partial<PopSetSummary>): PopSetSummary => ({
  id: "s", name: "Set", code: null, language: "en", releaseYear: 2000, series: null, cardCount: 1, total: 1, ...o,
});

const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("CategorySets", () => {
  test("TCG sets are grouped by series (era), unlabelled ones last", () => {
    renderWithIntl(
      <CategorySets
        kind="tcg"
        sets={[
          set({ id: "a", name: "Alpha", series: "Sword" }),
          set({ id: "b", name: "Beta", series: null }),
          set({ id: "c", name: "Gamma", series: "Base" }),
        ]}
      />,
    );
    expect(headings()).toEqual(["Base", "Sword", messages.pop.category.noSeries]);
  });

  test("sports sets are grouped by release year, newest first", () => {
    renderWithIntl(
      <CategorySets
        kind="sports"
        sets={[
          set({ id: "a", releaseYear: 1990 }),
          set({ id: "b", releaseYear: 2020 }),
          set({ id: "c", releaseYear: null }),
        ]}
      />,
    );
    expect(headings()).toEqual(["2020", "1990", messages.pop.category.noYear]);
  });

  test("each set links to its page and shows language only when not English", () => {
    renderWithIntl(
      <CategorySets
        kind="tcg"
        sets={[set({ id: "x1", name: "Alpha", series: "S" }), set({ id: "x2", name: "Beta", series: "S", language: "ja" })]}
      />,
    );
    expect(screen.getByRole("link", { name: /Alpha/ }).getAttribute("href")).toBe("/pop-report/sets/x1");
    expect(screen.getByRole("link", { name: /Beta/ }).textContent).toContain("ja");
    expect(screen.getByRole("link", { name: /Alpha/ }).textContent).not.toContain("Language");
  });
});
