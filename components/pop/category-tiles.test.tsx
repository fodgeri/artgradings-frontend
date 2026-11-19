import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";

import type { PopCategory } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen, within } from "@/test/i18n";

import { CategoryTiles } from "./category-tiles";

const categories: PopCategory[] = [
  { key: "basketball", kind: "sports", setCount: 2, total: 10 },
  { key: "pokemon", kind: "tcg", setCount: 3, total: 1200 },
];

describe("CategoryTiles", () => {
  test("groups tiles under their kind heading", () => {
    renderWithIntl(<CategoryTiles categories={categories} />);
    const tcg = screen.getByRole("heading", { name: messages.catalog.kinds.tcg.label }).closest("section")!;
    const sports = screen.getByRole("heading", { name: messages.catalog.kinds.sports.label }).closest("section")!;
    expect(within(tcg).getByRole("link", { name: new RegExp(messages.catalog.categories.pokemon.label) })).toBeTruthy();
    expect(within(tcg).queryByText(messages.catalog.categories.basketball.label)).toBeNull();
    expect(within(sports).getByRole("link", { name: new RegExp(messages.catalog.categories.basketball.label) })).toBeTruthy();
  });

  test("each tile links to its category and shows set count and total", () => {
    renderWithIntl(<CategoryTiles categories={categories} />);
    const link = screen.getByRole("link", { name: new RegExp(messages.catalog.categories.pokemon.label) });
    expect(link.getAttribute("href")).toBe("/pop-report/pokemon");
    const t = createTranslator({ locale: "en", messages, namespace: "pop.category" });
    expect(link.textContent).toContain(t("tileMeta", { sets: 3, total: 1200 }));
  });

  test("omits a kind with no categories", () => {
    renderWithIntl(<CategoryTiles categories={[categories[1]]} />);
    expect(screen.queryByRole("heading", { name: messages.catalog.kinds.sports.label })).toBeNull();
  });
});
