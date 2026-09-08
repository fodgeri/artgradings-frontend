import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { Steps } from "./steps";

const items = messages.howItWorks.steps;

describe("Steps", () => {
  test("renders one cell per item", () => {
    renderWithIntl(<Steps items={items} />);
    for (const step of items) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
      expect(screen.getByText(step.number)).toBeInTheDocument();
    }
  });

  test("renders each step's body", () => {
    renderWithIntl(<Steps items={items} />);
    expect(screen.getByText(items[0].body)).toBeInTheDocument();
  });

  test("annotates the sealing step with the gas fill", () => {
    // The brand manual establishes the inert gas fill as a product feature.
    // It annotates the existing seal step rather than becoming a fifth one —
    // the approved design has four, and adding a step is not ours to do.
    renderWithIntl(<Steps items={items} />);
    expect(screen.getByText(messages.home.gasFill)).toBeInTheDocument();
  });

  test("renders headings at h3 so a page's h1 and h2 stay unambiguous", () => {
    renderWithIntl(<Steps items={items} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(items.length);
  });
});
