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

  test("uses unprefixed hrefs for the default locale", () => {
    // `as-needed` prefixing means English URLs must have no /en segment.
    renderWithIntl(<SiteHeader />);
    expect(screen.getByRole("link", { name: messages.nav.faq })).toHaveAttribute(
      "href",
      "/faq",
    );
  });
});
