import { describe, expect, test, vi } from "vitest";

import { ORDER_STATUSES } from "@/lib/orders/status";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { CancelOrder } from "./cancel-order";

const t = messages.orders.order;

describe("CancelOrder", () => {
  test("Cancel is offered only while unpaid", () => {
    for (const status of ORDER_STATUSES) {
      const { unmount } = renderWithIntl(<CancelOrder reference="AG-ABCDEFGH" status={status} cancel={vi.fn()} />);
      const offered = status === "draft" || status === "awaiting_payment";
      expect(screen.queryByRole("button", { name: t.cancel }) !== null).toBe(offered);
      unmount();
    }
  });

  test("asks for confirmation first, and Keep cancels nothing", async () => {
    const cancel = vi.fn();
    const { user } = renderWithIntl(<CancelOrder reference="AG-ABCDEFGH" status="draft" cancel={cancel} />);

    await user.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.getByText(t.cancelConfirm)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.cancelKeep })).toHaveFocus();
    expect(cancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: t.cancelKeep }));
    expect(screen.queryByText(t.cancelConfirm)).toBeNull();
    expect(screen.getByRole("button", { name: t.cancel })).toBeEnabled();
    expect(cancel).not.toHaveBeenCalled();
  });

  test("disables while pending, so a double-click cancels once", async () => {
    const cancel = vi.fn(() => new Promise<never>(() => {}));
    const { user } = renderWithIntl(<CancelOrder reference="AG-ABCDEFGH" status="draft" cancel={cancel} />);

    await user.click(screen.getByRole("button", { name: t.cancel }));
    await user.click(screen.getByRole("button", { name: t.cancelConfirmYes }));
    const pending = screen.getByRole("button", { name: t.cancelling });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("button", { name: t.cancelKeep })).toBeDisabled();
    await user.click(pending);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("en", "AG-ABCDEFGH");
  });

  test("shows the refusal and re-enables", async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: false, errorKey: "notFound" });
    const { user } = renderWithIntl(<CancelOrder reference="AG-ABCDEFGH" status="draft" cancel={cancel} />);

    await user.click(screen.getByRole("button", { name: t.cancel }));
    await user.click(screen.getByRole("button", { name: t.cancelConfirmYes }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.cancelError);
    expect(screen.getByRole("button", { name: t.cancel })).toBeEnabled();
  });
});
