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
});
