import { describe, expect, test } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  test("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  test("lets a later Tailwind class win over an earlier conflicting one", () => {
    // This is the whole reason tailwind-merge exists: a component's own
    // padding must lose to a `className` passed by its caller.
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  test("keeps non-conflicting Tailwind classes", () => {
    expect(cn("px-4", "py-8")).toBe("px-4 py-8");
  });

  // tailwind-merge resolves conflicts by parsing class NAMES; it never reads
  // globals.css. Untaught, it took `text-eyebrow` for a text colour and threw
  // the font size away whenever a colour was set alongside it.
  describe("custom design system scales", () => {
    test.each([
      ["text-eyebrow", "text-gold-ink"],
      ["text-display", "text-ink"],
      ["text-lead", "text-muted"],
      ["text-meta", "text-muted"],
      ["text-h2", "text-ink"],
      ["text-h3", "text-ink"],
      ["text-kicker", "text-muted"],
      ["text-label", "text-muted"],
    ])("keeps %s alongside %s", (size, color) => {
      expect(cn(size, color)).toBe(`${size} ${color}`);
    });

    test("still collapses two custom font sizes", () => {
      expect(cn("text-eyebrow", "text-display")).toBe("text-display");
    });

    test("collapses custom radii", () => {
      expect(cn("rounded-card", "rounded-panel")).toBe("rounded-panel");
    });

    test("collapses a custom radius against a built-in one", () => {
      expect(cn("rounded-card", "rounded-full")).toBe("rounded-full");
    });

    test("collapses the page container against a built-in max width", () => {
      expect(cn("max-w-page", "max-w-3xl")).toBe("max-w-3xl");
    });

    test("collapses custom shadows", () => {
      expect(cn("shadow-card", "shadow-gold")).toBe("shadow-gold");
    });
  });
});
