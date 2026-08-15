import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Eyebrow } from "./eyebrow";

describe("Eyebrow", () => {
  test("renders its children", () => {
    renderWithIntl(<Eyebrow>Recently graded</Eyebrow>);
    expect(screen.getByText("Recently graded")).toBeInTheDocument();
  });

  test("uses the accessible gold, never the decorative one", () => {
    renderWithIntl(<Eyebrow>Pricing</Eyebrow>);
    const el = screen.getByText("Pricing");
    expect(el.className).toContain("text-gold-ink");
    // The `(?!-)` matters: `\b` counts a hyphen as a word boundary, so a bare
    // /\btext-gold\b/ matches inside `text-gold-ink` and this always fails.
    expect(el.className).not.toMatch(/\btext-gold\b(?!-)/);
  });

  test("keeps the eyebrow font size alongside the gold text colour", () => {
    // Regression guard for the tailwind-merge collision — see lib/cn.ts.
    renderWithIntl(<Eyebrow>Showcase</Eyebrow>);
    expect(screen.getByText("Showcase").className).toContain("text-eyebrow");
  });

  test("merges a caller className", () => {
    renderWithIntl(<Eyebrow className="mt-8">FAQ</Eyebrow>);
    expect(screen.getByText("FAQ").className).toContain("mt-8");
  });
});
