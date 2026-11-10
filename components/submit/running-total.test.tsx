import { createTranslator } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import type { Quote } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { RunningTotal } from "./running-total";

const t = createTranslator({
  locale: "en",
  messages,
  namespace: "submit.total",
});
const euros = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" });

const quote: Quote = {
  currency: "EUR",
  cards: [],
  subtotalCents: 10000,
  inboundCents: 1000,
  returnCents: 2345,
  totalCents: 123456,
  declaredValueTotalCents: 0,
  turnaroundDays: 15,
};

describe("RunningTotal", () => {
  test("formats the total as currency and shows the turnaround", () => {
    renderWithIntl(<RunningTotal quote={quote} cardCount={2} />);
    expect(screen.getByText(euros.format(1234.56))).toBeInTheDocument();
    expect(screen.getByText(t("cards", { count: 2 }))).toBeInTheDocument();
    expect(screen.getByText(t("turnaroundDays", { days: 15 }))).toBeInTheDocument();
  });

  test("singular card and day", () => {
    renderWithIntl(
      <RunningTotal quote={{ ...quote, turnaroundDays: 1 }} cardCount={1} />,
    );
    expect(screen.getByText(t("cards", { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(t("turnaroundDays", { days: 1 }))).toBeInTheDocument();
  });

  test("shows a dash while the turnaround is unknown", () => {
    renderWithIntl(
      <RunningTotal quote={{ ...quote, turnaroundDays: null }} cardCount={0} />,
    );
    expect(screen.getByText(messages.submit.total.unknown)).toBeInTheDocument();
  });

  test("renders the action slot", () => {
    renderWithIntl(
      <RunningTotal quote={quote} cardCount={1} action={<button>Go</button>} />,
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  test("shows a dash, not zero, while nothing is priced", () => {
    renderWithIntl(
      <RunningTotal
        quote={{ ...quote, cards: [{ cardId: "a", priceCents: null, identificationCents: 0 }], totalCents: 0 }}
        cardCount={1}
      />,
    );
    expect(screen.getByTestId("order-total")).toHaveTextContent(messages.submit.total.unknown);
    expect(screen.getByTestId("order-total")).not.toHaveTextContent(euros.format(0));
  });

  test("a total made only of the identification fee is shown, with its own line", () => {
    renderWithIntl(
      <RunningTotal
        quote={{ ...quote, cards: [{ cardId: "a", priceCents: null, identificationCents: 200 }], totalCents: 200 }}
        cardCount={1}
        lines={[{ id: "a", title: "Card A", detail: null }]}
      />,
    );
    expect(screen.getByTestId("order-total")).toHaveTextContent(euros.format(2));
    expect(screen.getByText(t("identification")).closest("li")).toHaveTextContent(euros.format(2));
    // The card itself has no service yet: a dash, not a price.
    expect(screen.getByText("Card A").closest("li")).toHaveTextContent(messages.submit.total.unknown);
  });

  test("a card line shows its service price without the identification fee", () => {
    renderWithIntl(
      <RunningTotal
        quote={{ ...quote, cards: [{ cardId: "a", priceCents: 300, identificationCents: 200 }] }}
        cardCount={1}
        lines={[{ id: "a", title: "Card A", detail: "Grading · Standard" }]}
      />,
    );
    const line = screen.getByText("Card A").closest("li");
    expect(line).toHaveTextContent(euros.format(1));
    expect(line).toHaveTextContent("Grading · Standard");
  });

  test("shipping is promised for the next step until the step can quote it", () => {
    const { rerender } = renderWithIntl(<RunningTotal quote={quote} cardCount={1} />);
    expect(screen.getByText(t("shippingLater"))).toBeInTheDocument();
    rerender(<RunningTotal quote={quote} cardCount={1} shipping="fees" />);
    expect(screen.queryByText(t("shippingLater"))).toBeNull();
    expect(screen.getByText(t("shipping")).closest("li")).toHaveTextContent(euros.format(33.45));
  });

  test("lists at most three things to finish, then counts the rest", async () => {
    const onSelect = vi.fn();
    const todos = ["one", "two", "three", "four", "five"].map((id) => ({ id, label: `Fix ${id}`, onSelect }));
    const { user } = renderWithIntl(<RunningTotal quote={quote} cardCount={1} todos={todos} />);
    expect(screen.getByText(t("todo", { count: 5 }))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fix four" })).toBeNull();
    expect(screen.getByText(t("todoMore", { count: 2 }))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fix two" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("the details toggle says whether the details are open", async () => {
    const { user } = renderWithIntl(<RunningTotal quote={quote} cardCount={1} />);
    const toggle = screen.getByRole("button", { name: t("showDetails") });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: t("hideDetails") })).toHaveAttribute("aria-expanded", "true");
  });
});
