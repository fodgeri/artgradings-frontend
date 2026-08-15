import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Section } from "./section";

describe("Section", () => {
  test("renders a <section> with its children", () => {
    renderWithIntl(<Section>body</Section>);
    expect(screen.getByText("body").tagName).toBe("SECTION");
  });

  test("applies the inverted surface only when asked", () => {
    const { rerender } = renderWithIntl(<Section>plain</Section>);
    expect(screen.getByText("plain").className).not.toContain("surface-invert");

    rerender(<Section invert>flipped</Section>);
    expect(screen.getByText("flipped").className).toContain("surface-invert");
  });

  test("forwards an id so in-page anchors work", () => {
    renderWithIntl(<Section id="pricing">x</Section>);
    expect(screen.getByText("x")).toHaveAttribute("id", "pricing");
  });
});
