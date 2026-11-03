import { beforeEach, describe, expect, test, vi } from "vitest";

import { MAX_CARDS_PER_ORDER } from "@/lib/orders/card-rules";
import { REFERENCE_DRAFT } from "@/lib/orders/fixtures";
import type { Quote } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({ submitOrder: vi.fn(), refresh: vi.fn() }));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
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
    expect(screen.getAllByText(s.identification.replace("{amount}", "€2.00"))).toHaveLength(1);
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

  test("a tooManyCards refusal names the limit", async () => {
    mocks.submitOrder.mockResolvedValue({ ok: false, errorKey: "tooManyCards" });
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: s.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      messages.submit.errors.tooManyCards.replace("{max, number}", String(MAX_CARDS_PER_ORDER)),
    );
  });

  test("a stale-quote refusal refreshes the page for the server to route the customer", async () => {
    mocks.submitOrder.mockResolvedValue({ ok: false, errorKey: "serviceUnavailable" });
    // A refresh that never settles keeps the transition pending.
    mocks.refresh.mockImplementation(() => new Promise(() => {}));
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: s.submit }));

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(messages.submit.errors.serviceUnavailable);
    expect(screen.getByRole("button", { name: s.submit })).toBeDisabled();
  });

  test("a generic refusal does not refresh and re-enables", async () => {
    mocks.submitOrder.mockResolvedValue({ ok: false, errorKey: "generic" });
    const { user } = renderWithIntl(<SummaryStep draft={REFERENCE_DRAFT} quote={QUOTE} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: s.submit }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: s.submit })).toBeEnabled();
  });
});
