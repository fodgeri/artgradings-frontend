import { describe, expect, test } from "vitest";

import type { PopCard } from "@/lib/pop/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { CardDetails } from "./card-details";

const card = (o: Partial<PopCard> = {}): PopCard => ({
  id: "c1", setId: "s1", setName: "Base Set", setCode: "BS", category: "pokemon", kind: "tcg",
  cardNumber: "4/102", name: "Charizard", variant: "1st Edition", rarity: "Rare Holo",
  language: "en", releaseYear: 1999, series: null,
  gradeCounts: {}, authenticCount: 0, total: 0, autographCounts: {}, autographTotal: 0, ...o,
});

describe("CardDetails", () => {
  test("renders every present field and links to the set", () => {
    renderWithIntl(<CardDetails card={card()} />);
    for (const v of ["Charizard", "4/102", "1st Edition", "Rare Holo", "1999"]) {
      expect(screen.getByText(new RegExp(v))).toBeInTheDocument();
    }
    expect(screen.getByText(messages.catalog.categories.pokemon.label)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Base Set" })).toHaveAttribute("href", "/pop-report/sets/s1");
  });

  test("links the category, or shows plain text when the category page would 404", () => {
    const label = messages.catalog.categories.pokemon.label;
    const { unmount } = renderWithIntl(<CardDetails card={card()} />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "/pop-report/pokemon");
    unmount();
    renderWithIntl(<CardDetails card={card()} categoryLinkable={false} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: label })).toBeNull();
  });

  test("omits absent variant and rarity lines", () => {
    renderWithIntl(<CardDetails card={card({ variant: null, rarity: null })} />);
    expect(screen.queryByText(messages.pop.card.variant)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.pop.card.rarity)).not.toBeInTheDocument();
  });
});
