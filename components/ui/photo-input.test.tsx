import { describe, expect, test, vi } from "vitest";

import { renderWithIntl, screen } from "@/test/i18n";

import { PhotoInput } from "./photo-input";

const base = {
  label: "Card photo",
  removeLabel: "Remove photo",
  onSelect: () => {},
  onRemove: () => {},
};

describe("PhotoInput", () => {
  test("accepts only the three image types", () => {
    const { container } = renderWithIntl(<PhotoInput {...base} />);
    expect(container.querySelector("input[type=file]")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
  });

  test("is disabled while disabled is true", () => {
    const { container } = renderWithIntl(<PhotoInput {...base} disabled />);
    expect(container.querySelector("input[type=file]")).toBeDisabled();
  });

  test("is disabled while busy", () => {
    const { container } = renderWithIntl(<PhotoInput {...base} busy />);
    expect(container.querySelector("input[type=file]")).toBeDisabled();
  });

  test("shows the preview and a remove control when previewUrl is set", async () => {
    const onRemove = vi.fn();
    const { user } = renderWithIntl(
      <PhotoInput {...base} previewUrl="/preview.webp" onRemove={onRemove} />,
    );
    expect(document.querySelector("img")).toHaveAttribute("src", "/preview.webp");
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(onRemove).toHaveBeenCalled();
  });

  test("has no preview or remove control without previewUrl", () => {
    renderWithIntl(<PhotoInput {...base} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  test("reports the chosen file", async () => {
    const onSelect = vi.fn();
    const { user, container } = renderWithIntl(
      <PhotoInput {...base} onSelect={onSelect} />,
    );
    const file = new File(["x"], "a.png", { type: "image/png" });
    await user.upload(container.querySelector("input[type=file]")!, file);
    expect(onSelect).toHaveBeenCalledWith(file);
  });
});
