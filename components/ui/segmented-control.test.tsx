import { useState } from "react";
import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "sports", label: "Sports" },
  { value: "tcg", label: "TCG" },
];

function Harness() {
  const [value, setValue] = useState("all");
  return (
    <SegmentedControl
      label="Filter cards"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

describe("SegmentedControl", () => {
  test("renders one button per option", () => {
    renderWithIntl(<Harness />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  test("marks the selected option as pressed", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "TCG" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("selects a different option on click", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("button", { name: "TCG" }));
    expect(screen.getByRole("button", { name: "TCG" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("never clears the selection when the active option is clicked again", async () => {
    // A segmented control is single-select: clicking the pressed option must
    // be a no-op, not a toggle-off. ToggleGroup would happily return [].
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("moves focus with the arrow keys", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.tab();
    expect(screen.getByRole("button", { name: "All" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Sports" })).toHaveFocus();
  });

  test("names the group for assistive technology", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("group", { name: "Filter cards" })).toBeInTheDocument();
  });
});
