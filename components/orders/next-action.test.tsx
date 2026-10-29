import { describe, expect, test } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { NextAction } from "./next-action";

const t = messages.orders.next;

describe("NextAction", () => {
  test("links to the parcel label and the submission form for a postal order", () => {
    renderWithIntl(<NextAction reference="AG-ABCDEFGH" action={{ kind: "ship" }} />);

    expect(screen.getByText(t.ship.instructions)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.ship.label })).toHaveAttribute(
      "href",
      "/account/orders/AG-ABCDEFGH/label",
    );
    expect(screen.getByRole("link", { name: t.ship.form })).toHaveAttribute(
      "href",
      "/account/orders/AG-ABCDEFGH/form",
    );
  });

  test("bringing in person links to the label and the form too", () => {
    renderWithIntl(<NextAction reference="AG-ABCDEFGH" action={{ kind: "bringIn" }} />);

    expect(screen.getByText(t.bringIn.instructions)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.bringIn.label })).toHaveAttribute(
      "href",
      "/account/orders/AG-ABCDEFGH/label",
    );
    expect(screen.getByRole("link", { name: t.bringIn.form })).toHaveAttribute(
      "href",
      "/account/orders/AG-ABCDEFGH/form",
    );
  });

  test("without a payment provider, says online payment is unavailable and offers no link", () => {
    renderWithIntl(<NextAction reference="AG-ABCDEFGH" action={{ kind: "paymentUnavailable" }} />);

    expect(screen.getByText(t.paymentUnavailable)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("pay links to the payment page, none renders nothing", () => {
    const { container, rerender } = renderWithIntl(<NextAction reference="AG-ABCDEFGH" action={{ kind: "pay" }} />);
    expect(screen.getByRole("link", { name: t.pay })).toHaveAttribute("href", "/account/orders/AG-ABCDEFGH/pay");
    rerender(<NextAction reference="AG-ABCDEFGH" action={{ kind: "none" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
