import { describe, expect, test } from "vitest";

import type { OrderSummary } from "@/lib/orders/load-orders";
import messages from "@/messages/en.json";
import { renderWithIntl, screen, within } from "@/test/i18n";

import { OrdersList } from "./orders-list";

const t = messages.orders;
const base = { createdAt: "2026-10-01T10:00:00Z", submittedAt: null, cardCount: 2, totalCents: null, currency: "EUR" };
const ORDERS: OrderSummary[] = [
  { ...base, reference: "AG-DRAFTDRA", status: "draft" },
  { ...base, reference: "AG-PAIDPAID", status: "paid", submittedAt: "2026-10-02T10:00:00Z", totalCents: 9900 },
];

describe("OrdersList", () => {
  test("the draft is listed first with Continue", () => {
    renderWithIntl(<OrdersList orders={ORDERS} />);

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText(t.status.draft)).toBeInTheDocument();
    expect(within(items[0]).getByRole("link", { name: t.list.continue })).toHaveAttribute("href", "/submit");
    expect(within(items[1]).getByRole("link", { name: t.list.view })).toHaveAttribute(
      "href",
      "/account/orders/AG-PAIDPAID",
    );
    expect(within(items[1]).getByText("€99.00")).toBeInTheDocument();
  });

  test("says so when there are no orders", () => {
    renderWithIntl(<OrdersList orders={[]} />);
    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });
});
