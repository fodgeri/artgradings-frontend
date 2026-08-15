import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Accordion } from "./accordion";

const ITEMS = [
  { id: "a", question: "How long does grading take?", answer: "It depends on the service level." },
  { id: "b", question: "What does the grade mean?", answer: "Four sub-grades make a final 1-10." },
];

describe("Accordion", () => {
  test("renders a trigger per item", () => {
    renderWithIntl(<Accordion items={ITEMS} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("starts fully collapsed", () => {
    renderWithIntl(<Accordion items={ITEMS} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByText(ITEMS[0].answer)).not.toBeInTheDocument();
  });

  test("opens an item on click", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    await user.click(screen.getByRole("button", { name: /How long/ }));
    expect(screen.getByRole("button", { name: /How long/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(ITEMS[0].answer)).toBeInTheDocument();
  });

  test("closes the item again on a second click", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    const trigger = screen.getByRole("button", { name: /How long/ });
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("points the trigger at the panel it controls", async () => {
    const { user } = renderWithIntl(<Accordion items={ITEMS} />);
    const trigger = screen.getByRole("button", { name: /How long/ });
    await user.click(trigger);
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toHaveTextContent(ITEMS[0].answer);
  });
});
