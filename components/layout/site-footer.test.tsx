import { describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

// AccountLink has its own tests; here it would need a Supabase client and a
// router context the footer does not care about.
vi.mock("./account-link", () => ({
  AccountLink: ({ className }: { className?: string }) => (
    <a data-testid="footer-account-link" href="/sign-in" className={className}>
      Sign in
    </a>
  ),
}));

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

  test("carries the sign-in / account link the header drops on mobile", () => {
    // The header hides AccountLink below `sm` with no width budget to spare;
    // this is the only path to sign-in or /account a phone gets.
    renderWithIntl(<SiteFooter />);
    expect(screen.getByTestId("footer-account-link")).toBeInTheDocument();
  });
});
