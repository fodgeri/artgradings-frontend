import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { Switch } from "./switch";

function Harness({ onChange }: { onChange?: (v: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      label="Insured return shipping"
      checked={on}
      onCheckedChange={(v) => {
        setOn(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Switch", () => {
  test("exposes the switch role with an accessible name", () => {
    renderWithIntl(<Harness />);
    expect(
      screen.getByRole("switch", { name: "Insured return shipping" }),
    ).toBeInTheDocument();
  });

  test("starts unchecked", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  test("toggles on click", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("toggles with the space key", async () => {
    const { user } = renderWithIntl(<Harness />);
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("reports the new value as a plain boolean", async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("does not toggle when disabled", async () => {
    const { user } = renderWithIntl(
      <Switch label="Off limits" checked={false} disabled onCheckedChange={() => {}} />,
    );
    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
