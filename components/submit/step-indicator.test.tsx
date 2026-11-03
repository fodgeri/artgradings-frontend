import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { StepIndicator } from "./step-indicator";

const steps = messages.submit.steps;

describe("StepIndicator", () => {
  test("links back, not forward", () => {
    renderWithIntl(<StepIndicator current="shipping" />);
    expect(screen.getByRole("link", { name: steps.cards })).toHaveAttribute(
      "href",
      "/submit",
    );
    expect(screen.queryByRole("link", { name: steps.shipping })).toBeNull();
    expect(screen.queryByRole("link", { name: steps.summary })).toBeNull();
    expect(screen.getByText(steps.shipping)).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText(steps.summary)).not.toHaveAttribute("aria-current");
  });

  test("the summary step links to both earlier steps", () => {
    renderWithIntl(<StepIndicator current="summary" />);
    expect(screen.getByRole("link", { name: steps.shipping })).toHaveAttribute(
      "href",
      "/submit/shipping",
    );
    expect(screen.getByRole("link", { name: steps.cards })).toHaveAttribute(
      "href",
      "/submit",
    );
  });

  test("the first step has no links", () => {
    renderWithIntl(<StepIndicator current="cards" />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
