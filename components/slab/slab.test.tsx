import { describe, expect, test } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { type SlabData, Slab } from "./slab";

const data: SlabData = {
  cert: "ART-08831204",
  category: "TCG",
  name: "Charizard",
  year: "1999",
  set: "Base · Holo",
  number: "#004/102",
  rarity: "HOLO RARE",
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

  test("renders the set number", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("#004/102")).toBeInTheDocument();
  });

  test("renders the rarity when the card has one", () => {
    renderWithIntl(<Slab data={data} />);
    expect(screen.getByText("HOLO RARE")).toBeInTheDocument();
  });

  test("omits the rarity line entirely when the card has none", () => {
    // Rarity is on the physical label but is NOT among M3's required per-card
    // fields, so it stays optional until the client decides whether the
    // submission form collects it. Absent means no line, not a blank one.
    renderWithIntl(<Slab data={{ ...data, rarity: undefined }} />);
    expect(screen.queryByText("HOLO RARE")).not.toBeInTheDocument();
  });

  test("the label's brand mark is decorative", () => {
    // The mark repeats on every slab in a grid, and the card's own name, cert
    // and grade already carry the meaning. Announcing "ART" once per slab in
    // a Pop Report listing is noise, so the label's mark is aria-hidden even
    // though the header's — which names the home link — is not.
    renderWithIntl(<Slab data={data} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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
