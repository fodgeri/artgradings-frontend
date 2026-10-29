import { describe, expect, test } from "vitest";

import type { Quote } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

import { RunningTotal } from "./running-total";

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
    expect(screen.getByText("€1,234.56")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
    expect(screen.getByText("15 business days")).toBeInTheDocument();
  });

  test("singular card and day", () => {
    renderWithIntl(
      <RunningTotal quote={{ ...quote, turnaroundDays: 1 }} cardCount={1} />,
    );
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.getByText("1 business day")).toBeInTheDocument();
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
});
