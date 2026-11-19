import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";

import type { PopSearchResult } from "@/lib/search/query";
import type { PopCardDocument } from "@/lib/search/documents";
import { GRADE_KEYS } from "@/lib/pop/keys";
import type { Grade } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SearchResults } from "./search-results";

const grades: Grade[] = GRADE_KEYS.map((key, i) => ({ key, value: 1 + i * 0.5 }));

const hit: PopCardDocument = {
  id: "card-1", name: "Charizard", card_number: "4/102", number_key: "4", variant: "Holo", rarity: null,
  set_id: "set-1", set_name: "Base Set", set_code: null, series: null, language: "en",
  release_year: 1999, category: "pokemon", kind: "tcg", grade_counts: { g8: 5, g9: 2 },
  authentic_count: 0, total: 7, autograph_total: 0, grades_present: ["g8", "g9"],
  latest_published_at: null,
};

const ok = (hits: PopCardDocument[], page = 1, pages = 1): PopSearchResult => ({
  status: "ok", hits, total: hits.length, page, pages,
});
const search = { q: "char", page: 1 };
const t = createTranslator({ locale: "en", messages, namespace: "pop.search.results" });

describe("SearchResults", () => {
  test("links each hit to its card page and shows its details", () => {
    renderWithIntl(<SearchResults result={ok([hit])} search={search} grades={grades} />);
    const link = screen.getByRole("link", { name: /Charizard/ });
    expect(link.getAttribute("href")).toBe("/pop-report/cards/card-1");
    expect(screen.getByText("Base Set", { exact: false })).toBeTruthy();
    expect(screen.getByText("1999", { exact: false })).toBeTruthy();
    expect(screen.getByText(/Holo/)).toBeTruthy();
  });

  test("shows the highest grade present, not the first", () => {
    renderWithIntl(<SearchResults result={ok([hit])} search={search} grades={grades} />);
    const expected = t("highest", { grade: `9 ${messages.catalog.grades.g9.label}`, count: "2" });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  test("a card with only authentic copies says it has no grades", () => {
    const authenticOnly = { ...hit, grade_counts: {}, grades_present: ["authentic"], authentic_count: 2, total: 2 };
    renderWithIntl(<SearchResults result={ok([authenticOnly])} search={search} grades={grades} />);
    expect(screen.getByText(messages.pop.search.results.noGrades)).toBeTruthy();
  });

  test("renders the unavailable state", () => {
    renderWithIntl(<SearchResults result={{ status: "unavailable" }} search={search} grades={grades} />);
    expect(screen.getByText(messages.pop.search.results.unavailable)).toBeTruthy();
    expect(screen.getByRole("link", { name: messages.pop.search.results.browse }).getAttribute("href")).toBe("/pop-report");
  });

  test("renders the empty state", () => {
    renderWithIntl(<SearchResults result={ok([])} search={search} grades={grades} />);
    expect(screen.getByText(messages.pop.search.results.empty)).toBeTruthy();
  });

  test("pagination: only next on the first page, both in the middle, carrying the filters", () => {
    const { unmount } = renderWithIntl(
      <SearchResults result={ok([hit], 1, 3)} search={{ ...search, kind: "tcg" }} grades={grades} />,
    );
    expect(screen.queryByRole("link", { name: messages.pop.search.results.previous })).toBeNull();
    const next = screen.getByRole("link", { name: messages.pop.search.results.next });
    expect(next.getAttribute("href")).toBe("/pop-report?q=char&kind=tcg&page=2");
    unmount();
    renderWithIntl(<SearchResults result={ok([hit], 2, 3)} search={{ ...search, page: 2 }} grades={grades} />);
    expect(screen.getByRole("link", { name: messages.pop.search.results.previous }).getAttribute("href")).toBe(
      "/pop-report?q=char",
    );
    expect(screen.getByRole("link", { name: messages.pop.search.results.next })).toBeTruthy();
  });

  test("no pagination for a single page", () => {
    renderWithIntl(<SearchResults result={ok([hit])} search={search} grades={grades} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
