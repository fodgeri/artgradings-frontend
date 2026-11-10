import { describe, expect, test, vi } from "vitest";

import { fireEvent } from "@testing-library/react";

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

  test("hides the picker once a photo exists: remove it first, then add another", () => {
    const { container } = renderWithIntl(<PhotoInput {...base} previewUrl="/preview.webp" />);
    expect(container.querySelector("input[type=file]")).toBeNull();
    expect(screen.queryByText("Card photo")).toBeNull();
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

  // jsdom cannot evaluate :focus-visible, so pin the class contract. The
  // `focus-ring` utility is `&:focus-visible` and would target the label
  // itself, which is never focused; the hidden input is, so the label must
  // react through :has().
  test("the visible label shows a focus ring when the hidden input is focus-visible", () => {
    const { container } = renderWithIntl(<PhotoInput {...base} />);
    const label = container.querySelector("input[type=file]")!.closest("label")!;
    expect(label).toHaveClass(
      "has-[:focus-visible]:outline-2",
      "has-[:focus-visible]:outline-offset-2",
      "has-[:focus-visible]:outline-gold",
    );
    expect(label.className).not.toContain("focus-within:focus-ring");
  });

  test("shows the busy label in place of the label while busy", () => {
    renderWithIntl(<PhotoInput {...base} busy busyLabel="Uploading" />);
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    // The input keeps its name: the visible text is what changes.
    expect(screen.getByLabelText(base.label)).toBeDisabled();
  });

  const drop = (zone: Element, file: File) =>
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

  test("a dropped image is reported like a chosen one", () => {
    const onSelect = vi.fn();
    const { container } = renderWithIntl(<PhotoInput {...base} onSelect={onSelect} />);
    const file = new File(["x"], "a.webp", { type: "image/webp" });
    drop(container.querySelector("label")!, file);
    expect(onSelect).toHaveBeenCalledWith(file);
  });

  test("a dropped file of another type is rejected, not selected", () => {
    const onSelect = vi.fn();
    const onReject = vi.fn();
    const { container } = renderWithIntl(<PhotoInput {...base} onSelect={onSelect} onReject={onReject} />);
    drop(container.querySelector("label")!, new File(["x"], "a.pdf", { type: "application/pdf" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  test("nothing can be dropped while busy", () => {
    const onSelect = vi.fn();
    const { container } = renderWithIntl(<PhotoInput {...base} busy onSelect={onSelect} />);
    drop(container.querySelector("label")!, new File(["x"], "a.webp", { type: "image/webp" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
