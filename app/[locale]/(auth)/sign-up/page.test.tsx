import { describe, expect, test } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import SignUpPage from "./page";

describe("SignUpPage", () => {
  test("asks for an email and a policy-length password", () => {
    renderWithIntl(<SignUpPage />);
    expect(screen.getByLabelText(messages.auth.fields.email)).toHaveAttribute("type", "email");
    const password = screen.getByLabelText(messages.auth.fields.password);
    expect(password).toHaveAttribute("minLength", String(PASSWORD_MIN_LENGTH));
    expect(password).toHaveAttribute("autoComplete", "new-password");
  });

  test("links to sign-in", () => {
    // The link text lives inside the rich message's <link> tag; take it from
    // there rather than duplicating the copy.
    const linkText = /<link>(.*)<\/link>/.exec(messages.auth.signUp.haveAccount)?.[1] ?? "";
    renderWithIntl(<SignUpPage />);
    expect(screen.getByRole("link", { name: linkText })).toHaveAttribute("href", "/sign-in");
  });
});
