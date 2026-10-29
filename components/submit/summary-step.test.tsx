import { beforeEach, describe, expect, test, vi } from "vitest";

import { REFERENCE_DRAFT } from "@/lib/orders/fixtures";
import type { Quote } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({ submitOrder: vi.fn() }));
vi.mock("@/app/[locale]/submit/actions", () => ({ submitOrder: mocks.submitOrder }));

const { SummaryStep } = await import("./summary-step");

const s = messages.submit.summary;

const QUOTE: Quote = {
  currency: "EUR",
  cards: [
    { cardId: REFERENCE_DRAFT.cards[0].id, priceCents: 150, identificationCents: 0 },
    { cardId: REFERENCE_DRAFT.cards[1].id, priceCents: 300, identificationCents: 200 },
  ],
  subtotalCents: 450,
  inboundCents: 10,
  returnCents: 20,
  totalCents: 480,
  declaredValueTotalCents: 130000,
  turnaroundDays: 30,
};

beforeEach(() => vi.clearAllMocks());

describe("SummaryStep", () => {
  test("shows the server's total, labelled VAT included", () => {
    renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);

    expect(screen.getByTestId("summary-total")).toHaveTextContent("€4.80");
    expect(screen.getByText(s.vatIncluded)).toBeInTheDocument();
    expect(screen.getByText("€1,300.00")).toBeInTheDocument();
  });

  test("shows the identification fee on an ART-identified card", () => {
    renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);

    expect(screen.getByText(s.unknownCard)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${s.identification}.*€2\\.00`))).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(s.identification))).toHaveLength(1);
  });

  test("links the terms to /terms", () => {
    renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);

    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/terms")).toBe(true);
  });

  test("Continue to payment is disabled until terms are accepted", async () => {
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    const button = screen.getByRole("button", { name: s.submit });

    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
  });

  test("submits once and stays disabled while submitting", async () => {
    mocks.submitOrder.mockReturnValue(new Promise(() => {}));
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: s.submit }));

    expect(mocks.submitOrder).toHaveBeenCalledWith("en", { termsAccepted: true });
    expect(screen.getByRole("button", { name: s.submitting })).toBeDisabled();
  });

  test("a refusal shows its message and re-enables the button", async () => {
    mocks.submitOrder.mockResolvedValue({ ok: false, errorKey: "serviceUnavailable" });
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: s.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.submit.errors.serviceUnavailable);
    expect(screen.getByRole("button", { name: s.submit })).toBeEnabled();
  });
});
