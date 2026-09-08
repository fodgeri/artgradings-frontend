import { describe, expect, test } from "vitest";

import { SAMPLE_SLABS } from "@/components/slab/fixtures";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { Hero } from "./hero";

describe("Hero", () => {
  test("renders the title as the page's h1", () => {
    renderWithIntl(<Hero cards={SAMPLE_SLABS} />);
    expect(
      screen.getByRole("heading", { level: 1, name: messages.home.title }),
    ).toBeInTheDocument();
  });

  test("the primary CTA points at the submission flow", () => {
    renderWithIntl(<Hero cards={SAMPLE_SLABS} />);
    expect(
      screen.getByRole("link", { name: messages.home.ctaPrimary }),
    ).toHaveAttribute("href", "/submit");
  });

  test("the secondary CTA points at how-it-works, not pricing", () => {
    // The design pointed this at #pricing. Pricing is deferred — its tiers and
    // turnarounds are invented and client-supplied — so the link was swapped
    // and `/pricing` stays a 404. Asserted so a future edit cannot quietly
    // reintroduce the dead link.
    renderWithIntl(<Hero cards={SAMPLE_SLABS} />);
    const secondary = screen.getByRole("link", { name: messages.home.ctaSecondary });
    expect(secondary).toHaveAttribute("href", "/how-it-works");
    expect(secondary).not.toHaveAttribute("href", "/pricing");
  });

  test("renders the stat strip", () => {
    renderWithIntl(<Hero cards={SAMPLE_SLABS} />);
    for (const stat of messages.home.stats) {
      expect(screen.getByText(stat.value)).toBeInTheDocument();
      expect(screen.getByText(stat.label)).toBeInTheDocument();
    }
  });

  test("shows three slabs, capped regardless of how many it is given", () => {
    renderWithIntl(<Hero cards={SAMPLE_SLABS} />);
    for (const card of SAMPLE_SLABS.slice(0, 3)) {
      expect(screen.getByText(card.cert)).toBeInTheDocument();
    }
    expect(screen.queryByText(SAMPLE_SLABS[3].cert)).not.toBeInTheDocument();
  });
});
