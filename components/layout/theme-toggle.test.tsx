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

  test("offers light, dark and system", () => {
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeLight }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.a11y.themeDark }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages.a11y.themeSystem }),
    ).toBeInTheDocument();
  });

  test("defaults to system when nothing is stored", () => {
    renderWithIntl(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: messages.a11y.themeSystem }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("choosing dark stamps the document and persists the choice", async () => {
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  test("choosing system clears both the attribute and the stored value", async () => {
    // This is what hands control back to prefers-color-scheme. Leaving a
    // stale data-theme behind would pin the user to their last explicit pick.
    const { user } = renderWithIntl(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: messages.a11y.themeDark }));
    await user.click(screen.getByRole("button", { name: messages.a11y.themeSystem }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  test("reflects an already-stored choice on mount", () => {
    localStorage.setItem("theme", "light");
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
