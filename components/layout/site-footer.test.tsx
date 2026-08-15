import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  test("renders the column headings", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByText(messages.footer.service)).toBeInTheDocument();
    expect(screen.getByText(messages.footer.company)).toBeInTheDocument();
    expect(screen.getByText(messages.footer.support)).toBeInTheDocument();
  });

  test("renders the tagline", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByText(messages.footer.tagline)).toBeInTheDocument();
  });

  test("interpolates the current year into the copyright", () => {
    renderWithIntl(<SiteFooter />);
    const year = String(new Date().getFullYear());
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });

  test("exposes a contentinfo landmark", () => {
    renderWithIntl(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  test("carries the theme control the header drops on mobile", () => {
    // Below `sm` the header has no room for it, so this is the only theme
    // control a phone gets. Deleting it strands mobile visitors on light.
    renderWithIntl(<SiteFooter />);
    expect(
      screen.getByRole("group", { name: messages.a11y.theme }),
    ).toBeInTheDocument();
  });
});
