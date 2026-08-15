import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Button, buttonVariants } from "./button";

describe("Button", () => {
  test("renders a native button element", () => {
    renderWithIntl(<Button>Submit a card</Button>);
    expect(screen.getByRole("button", { name: "Submit a card" })).toBeInTheDocument();
  });

  test("defaults to the gold variant at medium size", () => {
    renderWithIntl(<Button>Go</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("gold-fill");
    expect(el.className).toContain("h-[50px]");
  });

  test("renders the ghost variant without the gold fill", () => {
    renderWithIntl(<Button variant="ghost">View pricing</Button>);
    expect(screen.getByRole("button").className).not.toContain("gold-fill");
  });

  test("renders the small size", () => {
    renderWithIntl(<Button size="sm">Sign in</Button>);
    expect(screen.getByRole("button").className).toContain("h-[42px]");
  });

  test("calls onClick", async () => {
    const onClick = vi.fn();
    const { user } = renderWithIntl(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    const { user } = renderWithIntl(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("merges a caller className last", () => {
    renderWithIntl(<Button className="w-full">Go</Button>);
    expect(screen.getByRole("button").className).toContain("w-full");
  });

  test("buttonVariants produces classes for a link", () => {
    expect(buttonVariants({ variant: "gold" })).toContain("gold-fill");
  });
});
