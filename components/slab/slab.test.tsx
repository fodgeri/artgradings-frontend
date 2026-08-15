import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { type SlabData, Slab } from "./slab";

const data: SlabData = {
  cert: "ART-08831204",
  category: "TCG",
  name: "Charizard",
  year: "1999",
  set: "Base · Holo",
  grade: "10",
  label: "GEM MINT",
};

describe("Slab", () => {
  test("renders the certificate number", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("ART-08831204")).toBeInTheDocument();
  });

  test("renders the card name and its year and set", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("Charizard")).toBeInTheDocument();
    expect(screen.getByText(/1999/)).toBeInTheDocument();
    expect(screen.getByText(/Base · Holo/)).toBeInTheDocument();
  });

  test("renders the grade and its label", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("GEM MINT")).toBeInTheDocument();
  });

  test("falls back to the hatch window when there is no image", () => {
    renderWithIntl(<Slab data={data} />);
    // Real card images arrive with R2 in M3. Until then the window shows the
    // category label over the hatch pattern, and there is no <img> to find.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("TCG")).toBeInTheDocument();
  });

  test("renders an image when one is supplied", () => {
    renderWithIntl(<Slab data={{ ...data, image: "/cards/charizard.webp" }} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/cards/charizard.webp");
  });

  test("gives the image an accessible name built from the card", () => {
    renderWithIntl(<Slab data={{ ...data, image: "/cards/charizard.webp" }} />);
    expect(screen.getByRole("img", { name: /Charizard/ })).toBeInTheDocument();
  });
});
