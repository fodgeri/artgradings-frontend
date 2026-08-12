import { expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import Home from "./page";

// `page.tsx` is a SYNCHRONOUS Server Component, so RTL renders it directly.
// `layout.tsx` is async and cannot be tested this way — that gap belongs to
// E2E in M8. Do not try to make an async Server Component render here.

test("renders the headline from the message file", () => {
  renderWithIntl(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: messages.home.title }),
  ).toBeInTheDocument();
});

test("renders the subtitle", () => {
  renderWithIntl(<Home />);

  expect(screen.getByText(messages.home.subtitle)).toBeInTheDocument();
});

test("links both calls to action to their destinations", () => {
  renderWithIntl(<Home />);

  expect(
    screen.getByRole("link", { name: messages.home.ctaPrimary }),
  ).toHaveAttribute("href", "/submit");

  expect(
    screen.getByRole("link", { name: messages.home.ctaSecondary }),
  ).toHaveAttribute("href", "/how-it-works");
});
