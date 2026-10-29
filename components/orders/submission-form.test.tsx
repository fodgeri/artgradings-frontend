import { describe, expect, test } from "vitest";

import type { OrderDetail, OrderDetailCard } from "@/lib/orders/load-orders";
import messages from "@/messages/en.json";
import { renderWithIntl, screen, within } from "@/test/i18n";

import { SubmissionForm } from "./submission-form";

const p = messages.orders.printables;
const card = (over: Partial<OrderDetailCard>): OrderDetailCard => ({
  id: "c", position: 0, identifiedBy: "customer", releaseYear: 1999, brand: "Pokemon", language: "en",
  name: "Charizard", setName: "Base Set", cardNumber: "4/102", surface: null, signed: false, numbered: true,
  declaredValueCents: 100000, service: "grading", tierKey: "standard", priceCents: 5000,
  identificationCents: null, addOns: [{ key: "zeta", priceCents: 100 }, { key: "alpha", priceCents: 200 }], ...over,
});
const ORDER: OrderDetail = {
  reference: "AG-0123ABCD", status: "paid", shippingMethod: "postal",
  contact: { firstName: "Ada", lastName: "Lovelace", phone: "+3630123456" },
  address: { country: "HU", postcode: "1011", city: "Budapest", line: "Fo utca 1" },
  currency: "EUR", subtotalCents: 8000, inboundCents: 1000, returnCents: 900, totalCents: 9900,
  declaredValueTotalCents: 150000, turnaroundDays: 20, createdAt: "2026-10-01T10:00:00Z",
  submittedAt: "2026-10-02T10:00:00Z",
  cards: [
    card({ id: "b", position: 1, name: "Blastoise", identifiedBy: "art", releaseYear: null, brand: null,
      language: null, setName: null, cardNumber: null, declaredValueCents: 50000, identificationCents: 500, addOns: [] }),
    card({ id: "a", position: 0 }),
  ],
  log: [], payments: [],
};

describe("SubmissionForm", () => {
  test("lists every card, numbered, in position order", () => {
    renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(p.cardLabel.replace("{number}", "1"))).toBeInTheDocument();
    expect(within(rows[0]).getByText("Charizard")).toBeInTheDocument();
    expect(within(rows[1]).getByText(p.cardLabel.replace("{number}", "2"))).toBeInTheDocument();
    expect(within(rows[1]).getByText("Blastoise")).toBeInTheDocument();
    expect(within(rows[0]).getByText("4/102")).toBeInTheDocument();
    expect(within(rows[0]).getByText("€1,000.00")).toBeInTheDocument();
    expect(screen.getByText(p.cardCount.replace("{count, plural, one {# card} other {# cards}}", "2 cards"))).toBeInTheDocument();
  });

  test("prints the address for a postal order only", () => {
    const { unmount } = renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    expect(screen.getByText(/Fo utca 1/)).toBeInTheDocument();
    unmount();

    renderWithIntl(<SubmissionForm order={{ ...ORDER, shippingMethod: "in_person" }} qrSvg="<svg/>" />);
    expect(screen.queryByText(/Fo utca 1/)).toBeNull();
  });

  test("renders add-ons in a deterministic order", () => {
    renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    expect(screen.getByText("alpha, zeta")).toBeInTheDocument();
  });

  test("marks an ART-identified card instead of empty fields", () => {
    renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    const row = screen.getAllByRole("listitem")[1];
    expect(within(row).getByText(p.artIdentifies)).toBeInTheDocument();
    expect(within(row).queryByText(p.cardNumber)).not.toBeInTheDocument();
  });

  test("shows the identification fee and the hints label on an ART-identified card", () => {
    renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    const row = screen.getAllByRole("listitem")[1];
    expect(within(row).getByText(p.identification)).toBeInTheDocument();
    expect(within(row).getByText("€5.00")).toBeInTheDocument();
    expect(within(row).getByText(p.hints)).toBeInTheDocument();
    expect(within(screen.getAllByRole("listitem")[0]).queryByText(p.hints)).not.toBeInTheDocument();
  });

  test("is theme-independent: fixed light colours, no theme tokens", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { container } = renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("bg-white", "text-black");
    expect(container.innerHTML).not.toMatch(/text-ink|text-muted|divide-hairline|border-ink/);
    document.documentElement.removeAttribute("data-theme");
  });

  test("shows the total declared value and the total paid", () => {
    renderWithIntl(<SubmissionForm order={ORDER} qrSvg="<svg/>" />);
    expect(screen.getByTestId("declared-total")).toHaveTextContent("€1,500.00");
    expect(screen.getByTestId("total-paid")).toHaveTextContent("€99.00");
  });
});
