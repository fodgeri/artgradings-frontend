import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SAMPLE_SLABS } from "@/components/slab/fixtures";

import { Landing } from "./landing";

// `landing.tsx` is a SYNCHRONOUS Server Component, so RTL renders it directly;
// `page.tsx` is async (it loads the slabs) and cannot be rendered here.
// `layout.tsx` is async and cannot be tested this way — that gap belongs to
// E2E in M8. Do not try to make an async Server Component render here.

describe("landing page", () => {
  test("renders the headline from the message file as the only h1", () => {
    renderWithIntl(<Landing slabs={SAMPLE_SLABS} />);

    expect(
      screen.getByRole("heading", { level: 1, name: messages.home.title }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  test("renders the subtitle", () => {
    renderWithIntl(<Landing slabs={SAMPLE_SLABS} />);
    expect(screen.getByText(messages.home.subtitle)).toBeInTheDocument();
  });

  test("every call to action points at the submission flow", () => {
    // The primary CTA appears twice by design — once in the hero and once in
    // the closing band — so this asserts over all of them rather than
    // assuming one.
    renderWithIntl(<Landing slabs={SAMPLE_SLABS} />);

    const primaries = screen.getAllByRole("link", { name: messages.home.ctaPrimary });
    expect(primaries.length).toBeGreaterThan(1);
    for (const link of primaries) expect(link).toHaveAttribute("href", "/submit");

    expect(
      screen.getByRole("link", { name: messages.home.ctaSecondary }),
    ).toHaveAttribute("href", "/how-it-works");
  });

  test("links onward to the full process and the full FAQ", () => {
    // The landing shows a slice of each; these are the routes that show all.
    renderWithIntl(<Landing slabs={SAMPLE_SLABS} />);

    expect(
      screen.getByRole("link", { name: new RegExp(messages.home.stepsLink) }),
    ).toHaveAttribute("href", "/how-it-works");
    expect(
      screen.getByRole("link", { name: new RegExp(messages.home.faqLink) }),
    ).toHaveAttribute("href", "/faq");
  });

  test("shows only the first four FAQ entries", () => {
    renderWithIntl(<Landing slabs={SAMPLE_SLABS} />);

    for (const item of messages.faq.items.slice(0, 4)) {
      expect(screen.getByRole("button", { name: item.question })).toBeInTheDocument();
    }
    for (const item of messages.faq.items.slice(4)) {
      expect(screen.queryByRole("button", { name: item.question })).not.toBeInTheDocument();
    }
  });
});
