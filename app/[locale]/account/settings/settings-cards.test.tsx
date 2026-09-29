import { describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

// The real actions import the service-role client, whose `server-only` import
// throws outside a server bundle. The cards only need something to bind.
vi.mock("./actions", () => ({
  updateName: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

const { SettingsCards } = await import("./settings-cards");

const s = messages.auth.settings;

function renderCards() {
  return renderWithIntl(
    <SettingsCards firstName="Ada" lastName={null} email="user@example.test" />,
  );
}

describe("SettingsCards", () => {
  test("shows the four sections", () => {
    renderCards();
    for (const title of [s.name.title, s.email.title, s.password.title, s.delete.title]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });

  test("prefills the names, with autocomplete hints and the length limit", () => {
    renderCards();
    const first = screen.getByLabelText(s.name.firstName);
    expect(first).toHaveValue("Ada");
    expect(first).toHaveAttribute("autoComplete", "given-name");
    expect(first).toHaveAttribute("maxLength", "100");
    expect(screen.getByLabelText(s.name.lastName)).toHaveValue("");
  });

  test("shows the current address", () => {
    renderCards();
    expect(
      screen.getByText(s.email.current.replace("{email}", "user@example.test")),
    ).toBeInTheDocument();
  });

  test("puts Turnstile on the password and delete forms only", () => {
    const { container } = renderCards();
    const forms = [...container.querySelectorAll("form")];
    const hasCaptcha = forms.map((form) => form.querySelector('input[name="captchaToken"]') !== null);
    // Order: name, email, password, delete.
    expect(hasCaptcha).toEqual([false, false, true, true]);
  });

  test("asks for the current password before a change or a deletion", () => {
    renderCards();
    const current = screen.getAllByLabelText(s.password.currentPassword);
    expect(current).toHaveLength(2);
    for (const input of current) expect(input).toHaveAttribute("autoComplete", "current-password");
  });
});
