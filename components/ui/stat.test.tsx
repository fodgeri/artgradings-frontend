import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Stat, StatStrip } from "./stat";

describe("Stat", () => {
  test("renders the value and the label", () => {
    renderWithIntl(<Stat value="1.2M+" label="Cards certified" />);
    expect(screen.getByText("1.2M+")).toBeInTheDocument();
    expect(screen.getByText("Cards certified")).toBeInTheDocument();
  });
});

describe("StatStrip", () => {
  test("renders each child stat", () => {
    renderWithIntl(
      <StatStrip>
        <Stat value="48hr" label="Express" />
        <Stat value="100%" label="Guaranteed" />
      </StatStrip>,
    );
    expect(screen.getByText("48hr")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  test("stacks two-up on small viewports before going to a row", () => {
    renderWithIntl(
      <StatStrip>
        <Stat value="1" label="a" />
      </StatStrip>,
    );
    const strip = screen.getByText("1").closest("div[class*='grid']");
    expect(strip?.className).toContain("grid-cols-2");
  });
});
