import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Card } from "./card";

describe("Card", () => {
  test("defaults to the solid surface", () => {
    renderWithIntl(<Card>inside</Card>);
    const el = screen.getByText("inside");
    expect(el.className).toContain("bg-surface-raised");
    expect(el.className).not.toContain("glass");
  });

  test("renders the glass variant without a solid background", () => {
    renderWithIntl(<Card variant="glass">inside</Card>);
    const el = screen.getByText("inside");
    expect(el.className).toContain("glass");
    expect(el.className).not.toContain("bg-surface-raised");
  });

  test("merges a caller className", () => {
    renderWithIntl(<Card className="p-10">inside</Card>);
    expect(screen.getByText("inside").className).toContain("p-10");
  });
});
