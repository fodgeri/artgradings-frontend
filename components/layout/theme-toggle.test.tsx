import { afterEach, beforeEach, describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  test("offers exactly light and dark", () => {
    renderWithIntl(<ThemeToggle />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.a11y.themeDark }),
    ).toBeInTheDocument();
  });

  test("defaults to light when nothing is stored", () => {
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("choosing dark stamps the document and persists the choice", async () => {
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("choosing light clears both the attribute and the stored value", async () => {
    // Light is the document default, so it is expressed as the ABSENCE of
    // data-theme. Writing data-theme="light" would be a second way to be
    // light and the two would drift.
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    await user.click(screen.getByRole("button", { name: messages.a11y.themeLight }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  test("reflects an already-stored dark choice on mount", () => {
    localStorage.setItem("theme", "dark");
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeDark }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("treats an unrecognised stored value as light", () => {
    localStorage.setItem("theme", "system");
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("picks up a choice made in another tab", async () => {
    // `useSyncExternalStore` subscribes to `storage`, which fires only in the
    // tabs that did NOT make the change. Without this the two tabs disagree
    // until reload.
    renderWithIntl(<ThemeToggle />);
    localStorage.setItem("theme", "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));

    await screen.findByRole("button", { name: messages.a11y.themeDark });
    expect(
      screen.getByRole("button", { name: messages.a11y.themeDark }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
