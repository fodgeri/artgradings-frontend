import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { ChoiceCards, ChoiceCheckCard } from "./choice-cards";

const OPTIONS = [
  { value: "standard", title: "Standard", description: "Regular turnaround.", meta: "€10.00" },
  {
    value: "express",
    title: "Express",
    meta: "€20.00",
    disabled: true,
    disabledReason: "Only up to €1,000.00.",
  },
  { value: "premium", title: "Premium" },
];

function Harness({ onChange = () => {} }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ChoiceCards
      label="Service level"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("ChoiceCards", () => {
  test("is a radio group named by its label, with nothing chosen at first", () => {
    renderWithIntl(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Service level" })).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  test("each radio is named by its title and described by its detail and price", () => {
    renderWithIntl(<Harness />);
    const standard = screen.getByRole("radio", { name: "Standard" });
    expect(standard).toHaveAccessibleDescription("Regular turnaround. €10.00");
  });

  test("choosing an option reports its value and checks it", async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Premium" }));
    expect(onChange).toHaveBeenCalledWith("premium");
    expect(screen.getByRole("radio", { name: "Premium" })).toBeChecked();
  });

  test("a disabled option stays on screen, says why, and cannot be chosen", async () => {
    const onChange = vi.fn();
    const { user } = renderWithIntl(<Harness onChange={onChange} />);
    const express = screen.getByRole("radio", { name: "Express" });
    expect(express).toHaveAttribute("aria-disabled", "true");
    expect(express).toHaveAccessibleDescription(expect.stringContaining("Only up to €1,000.00."));
    await user.click(express);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("the reason is not shown for an option that is not disabled", () => {
    renderWithIntl(
      <ChoiceCards
        label="x"
        value={null}
        onValueChange={() => {}}
        options={[{ value: "a", title: "A", disabledReason: "Hidden reason" }]}
      />,
    );
    expect(screen.queryByText("Hidden reason")).toBeNull();
  });

  test("marks the group invalid when asked", () => {
    renderWithIntl(<ChoiceCards label="x" invalid value={null} onValueChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("ChoiceCheckCard", () => {
  test("is a checkbox named by its title that reports each toggle", async () => {
    const onCheckedChange = vi.fn();
    const { user } = renderWithIntl(
      <ChoiceCheckCard checked={false} onCheckedChange={onCheckedChange} title="Extra" description="An extra." meta="+€1.00" />,
    );
    const box = screen.getByRole("checkbox", { name: "Extra" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription("An extra. +€1.00");
    await user.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
