import { describe, expect, test } from "vitest";

import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { Showcase } from "./showcase";

const tcg = SAMPLE_SLABS.filter((c) => c.category === "TCG");
const sports = SAMPLE_SLABS.filter((c) => c.category === "Sports");

describe("Showcase", () => {
  test("renders every card before a filter is chosen", () => {
    renderWithIntl(<Showcase cards={SAMPLE_SLABS} />);
    for (const card of SAMPLE_SLABS) {
      expect(screen.getByText(card.cert)).toBeInTheDocument();
    }
  });

  test("filtering narrows the grid to the chosen category", async () => {
    const { user } = renderWithIntl(<Showcase cards={SAMPLE_SLABS} />);

    await user.click(screen.getByRole("button", { name: "TCG" }));

    for (const card of tcg) expect(screen.getByText(card.cert)).toBeInTheDocument();
    for (const card of sports) {
      expect(screen.queryByText(card.cert)).not.toBeInTheDocument();
    }
  });

  test("All restores the full set", async () => {
    const { user } = renderWithIntl(<Showcase cards={SAMPLE_SLABS} />);

    await user.click(screen.getByRole("button", { name: "Sports" }));
    expect(screen.queryByText(tcg[0].cert)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: messages.home.filterAll }));
    for (const card of SAMPLE_SLABS) {
      expect(screen.getByText(card.cert)).toBeInTheDocument();
    }
  });

  test("derives its filter options from the cards, not a hardcoded list", () => {
    // Only TCG cards in, so no Sports option may appear — the categories come
    // from the data so M4's real Pop Report cannot silently lose a filter.
    renderWithIntl(<Showcase cards={tcg} />);
    expect(screen.getByRole("button", { name: "TCG" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sports" })).not.toBeInTheDocument();
  });
});
