import { describe, expect, test } from "vitest";

import type { OrderDetail } from "@/lib/orders/load-orders";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { OrderDetails } from "./order-details";

const t = messages.orders.order;
const ORDER: OrderDetail = {
  reference: "AG-ABCDEFGH", status: "paid", shippingMethod: "postal",
  contact: { firstName: "Ada", lastName: "Lovelace", phone: "+3630123456" },
  address: { country: "HU", postcode: "1011", city: "Budapest", line: "Fo utca 1" },
  currency: "EUR", subtotalCents: 8000, inboundCents: 1000, returnCents: 900, totalCents: 9900,
  declaredValueTotalCents: 50000, turnaroundDays: 20, createdAt: "2026-10-01T10:00:00Z",
  submittedAt: "2026-10-02T10:00:00Z",
  cards: [
    {
      id: "c1", position: 0, identifiedBy: "art", releaseYear: null, brand: null, language: null,
      name: "Zard", setName: "Base", cardNumber: null, surface: null, signed: true, numbered: false,
      declaredValueCents: 50000, service: "dual", tierKey: "dual_standard", priceCents: 8000,
      identificationCents: 500, addOns: [{ key: "unknown_extra", priceCents: 300 }],
    },
  ],
  log: [], payments: [],
};

describe("OrderDetails", () => {
  test("shows the cards, the price lines and the delivery details, formatted", () => {
    renderWithIntl(<OrderDetails order={ORDER} />);

    expect(screen.getByText("Zard")).toBeInTheDocument();
    expect(screen.getByText(messages.catalog.services.dual.label, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Extras: unknown_extra")).toBeInTheDocument();
    expect(screen.getByTestId("order-total")).toHaveTextContent("€99.00");
    expect(screen.getByText(t.identification.replace("{amount}", "€5.00"))).toBeInTheDocument();
    expect(screen.getByText("€10.00")).toBeInTheDocument();
    expect(screen.getByText(t.method.postal)).toBeInTheDocument();
    expect(screen.getByText(/1011 Budapest, Hungary/)).toBeInTheDocument();
  });
});
