import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Checkbox } from "./checkbox";

function Harness({ onChange }: { onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Checkbox
      label="Express handling"
      description="Faster"
      checked={on}
      onCheckedChange={(v) => {
        setOn(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Checkbox", () => {
  test("starts unchecked when checked is false and reports toggles", async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Harness onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /Express handling/ });
    expect(box).toHaveAttribute("aria-checked", "false");
    await user.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("clicking the visible label toggles it", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByText("Express handling"));
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  test("shows the description", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByText("Faster")).toBeInTheDocument();
  });

  test("does not toggle when disabled", async () => {
    const { user } = renderWithIntl(
      <Checkbox label="Locked" checked={false} disabled onCheckedChange={() => {}} />,
    );
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });
});
