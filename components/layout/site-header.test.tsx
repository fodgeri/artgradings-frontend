import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  test("renders the primary navigation links", () => {
    renderWithIntl(<SiteHeader />);
    expect(
      screen.getByRole("link", { name: messages.nav.howItWorks }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.nav.faq })).toBeInTheDocument();
  });

  test("renders the submit call to action", () => {
    renderWithIntl(<SiteHeader />);
    expect(
      screen.getByRole("link", { name: new RegExp(messages.nav.submit) }),
    ).toHaveAttribute("href", "/submit");
  });

  test("exposes a landmark for the navigation", () => {
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  test("the home link keeps an accessible name", () => {
    // The wordmark is the home link's ONLY child, so it is that link's entire
    // accessible name. While the mark was a text node this held for free; once
    // it becomes an SVG the name has to come from a <title>, and an unnamed
    // link is the kind of regression nothing else here would catch.
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("link", { name: /art/i })).toHaveAttribute("href", "/");
  });

  test("uses unprefixed hrefs for the default locale", () => {
    // `as-needed` prefixing means English URLs must have no /en segment.
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("link", { name: messages.nav.faq })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
