import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { PayPanel } from "./pay-panel";

const t = messages.orders.pay;

beforeEach(() => vi.clearAllMocks());

describe("PayPanel", () => {
  test("shows the total and, while an action is pending, disables every control and ignores a second click", async () => {
    const user = userEvent.setup();
    const pay = vi.fn(() => new Promise<never>(() => {}));
    const fail = vi.fn();
    renderWithIntl(
      <PayPanel reference="AG-ABCDEFGH" totalCents={9900} currency="EUR" pay={pay} fail={fail} />,
    );
    expect(screen.getByText("€99.00").tagName).toBe("STRONG");
    expect(screen.getByText("€99.00").parentElement).toHaveTextContent(
      t.totalLine.replace(/<\/?strong>/g, "").replace("{amount}", "€99.00"),
    );

    await user.click(screen.getByRole("button", { name: t.pay }));
    await user.click(screen.getByRole("button", { name: t.working }));

    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenCalledWith("en", "AG-ABCDEFGH");
    expect(screen.getByRole("button", { name: t.fail })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.cancel })).toBeDisabled();
  });

  test("a failed action re-enables the controls and says so", async () => {
    const user = userEvent.setup();
    const pay = vi.fn().mockRejectedValue(new Error("boom"));
    renderWithIntl(
      <PayPanel reference="AG-ABCDEFGH" totalCents={9900} currency="EUR" pay={pay} fail={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: t.pay }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.error);
    expect(screen.getByRole("button", { name: t.pay })).toBeEnabled();
  });

  test("cancel returns to the order page without calling an action", async () => {
    const user = userEvent.setup();
    const pay = vi.fn();
    renderWithIntl(
      <PayPanel reference="AG-ABCDEFGH" totalCents={9900} currency="EUR" pay={pay} fail={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: t.cancel }));

    expect(mocks.push).toHaveBeenCalledWith("/account/orders/AG-ABCDEFGH");
    expect(pay).not.toHaveBeenCalled();
  });
});
