import { beforeEach, describe, expect, test, vi } from "vitest";

import { MAX_CARDS_PER_ORDER } from "@/lib/orders/card-rules";
import { CATALOG, REFERENCE_DRAFT } from "@/lib/orders/fixtures";
import type { Draft } from "@/lib/orders/types";
import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

const mocks = vi.hoisted(() => ({
  saveCard: vi.fn(),
  removeCard: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/[locale]/submit/actions", () => ({
  saveCard: mocks.saveCard,
  removeCard: mocks.removeCard,
  uploadPhoto: vi.fn(),
  removePhoto: vi.fn(),
}));
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

const { CardsStep } = await import("./cards-step");

const c = messages.submit.cards;
const complete: Draft = {
  ...REFERENCE_DRAFT,
  cards: [REFERENCE_DRAFT.cards[0]],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardsStep", () => {
  test("Add card appends an empty, customer-identified card and is disabled at 50", async () => {
    const { user } = renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: c.addCard }));
    expect(screen.getAllByRole("region")).toHaveLength(2);
    // The new card is the open one and starts as "I'll enter the details".
    expect(screen.getByRole("radio", { name: c.identification.customer })).toBeChecked();
    expect(screen.getByLabelText(c.fields.name)).toHaveValue("");
  });

  test("Add card is disabled at the maximum", () => {
    const cards = Array.from({ length: MAX_CARDS_PER_ORDER }, (_, i) => ({
      ...REFERENCE_DRAFT.cards[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      position: i,
    }));
    renderWithIntl(<CardsStep initialDraft={{ ...REFERENCE_DRAFT, cards }} catalog={CATALOG} />);
    expect(screen.getByRole("button", { name: c.addCard })).toBeDisabled();
  });

  test("Next with a problem does not leave: it shows every error and focuses the first field", async () => {
    const { user } = renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    const next = screen.getByRole("button", { name: c.next });
    expect(next).toBeEnabled();
    expect(screen.queryByText(c.problems.serviceMissing)).toBeNull();

    await user.click(next);

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.saveCard).not.toHaveBeenCalled();
    expect(screen.getByText(c.problems.serviceMissing)).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText(c.fields.name)).toHaveFocus());
  });

  test("the order panel lists what is missing, and a link opens that card at the field", async () => {
    const unfinished = { ...REFERENCE_DRAFT.cards[0], id: "22222222-2222-4222-8222-222222222222", position: 1, cardNumber: null };
    const draft: Draft = { ...REFERENCE_DRAFT, cards: [REFERENCE_DRAFT.cards[0], unfinished] };
    const { user } = renderWithIntl(<CardsStep initialDraft={draft} catalog={CATALOG} />);
    const label = c.todo.replace("{number}", "2").replace("{problem}", c.problems.cardNumberMissing);

    await user.click(screen.getByRole("button", { name: label }));

    await vi.waitFor(() => expect(screen.getByLabelText(c.fields.cardNumber)).toHaveFocus());
    expect(screen.getByLabelText(c.fields.cardNumber)).toHaveAccessibleDescription(
      c.problems.cardNumberMissing,
    );
  });

  test("switching back to entering details makes the empty fields block Next", async () => {
    const art: Draft = { ...REFERENCE_DRAFT, cards: [REFERENCE_DRAFT.cards[1]] };
    const { user } = renderWithIntl(<CardsStep initialDraft={art} catalog={CATALOG} />);
    await user.click(screen.getByRole("radio", { name: c.identification.customer }));
    await user.click(screen.getByRole("button", { name: c.next }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("a collapsed card shows its set, number, service and a needs-details badge", async () => {
    const unfinished = { ...REFERENCE_DRAFT.cards[0], id: "22222222-2222-4222-8222-222222222222", position: 1, name: null };
    const draft: Draft = { ...REFERENCE_DRAFT, cards: [REFERENCE_DRAFT.cards[0], unfinished] };
    renderWithIntl(<CardsStep initialDraft={draft} catalog={CATALOG} />);
    const row = screen.getByRole("region", { name: c.cardLabel.replace("{number}", "2") });
    expect(row).toHaveTextContent(unfinished.setName as string);
    expect(row).toHaveTextContent(messages.catalog.services.grading.label);
    expect(row).toHaveTextContent(c.needsDetails);
  });

  test("a blank card is removed at once, without asking", async () => {
    const { user } = renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    await user.click(screen.getByRole("button", { name: c.remove }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await vi.waitFor(() => expect(screen.queryAllByRole("region")).toHaveLength(0));
    expect(mocks.removeCard).not.toHaveBeenCalled();
  });

  test("a card with content asks first, and Keep card leaves it alone", async () => {
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.click(screen.getByRole("button", { name: c.remove }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(c.removeConfirm.body);
    await user.click(screen.getByRole("button", { name: c.removeConfirm.cancel }));
    expect(mocks.removeCard).not.toHaveBeenCalled();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  test("Next saves pending changes, then goes to shipping", async () => {
    mocks.saveCard.mockResolvedValue({ ok: true, data: { reference: "AG-0123ABCD" } });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.surface)), "Holo");
    await user.click(screen.getByRole("button", { name: c.next }));
    expect(mocks.saveCard).toHaveBeenCalledWith(
      "en",
      expect.objectContaining({ surface: "Holo", persisted: true }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/submit/shipping");
  });

  test("a cardGone save result removes the card and says why", async () => {
    mocks.saveCard.mockResolvedValue({ ok: false, errorKey: "cardGone" });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.surface)), "Holo");
    await user.click(screen.getByRole("button", { name: c.next }));
    expect(await screen.findByText(messages.submit.errors.cardGone)).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(mocks.removeCard).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("a tooManyCards save result names the limit", async () => {
    mocks.saveCard.mockResolvedValue({ ok: false, errorKey: "tooManyCards" });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.surface)), "Holo");
    await user.click(screen.getByRole("button", { name: c.next }));
    const expected = messages.submit.errors.tooManyCards.replace("{max, number}", String(MAX_CARDS_PER_ORDER));
    expect(await screen.findByText(expected, { exact: false })).toBeInTheDocument();
  });

  test("Next does not navigate when a save fails", async () => {
    mocks.saveCard.mockResolvedValue({ ok: false, errorKey: "generic" });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.surface)), "Holo");
    await user.click(screen.getByRole("button", { name: c.next }));
    expect(await screen.findByText(c.nextFailed)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  test("removing a card during its first save waits for it, then removes it on the server", async () => {
    let finish!: (v: unknown) => void;
    mocks.saveCard.mockReturnValue(new Promise((r) => (finish = r)));
    mocks.removeCard.mockResolvedValue({ ok: true, data: null });
    const { user } = renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.name), "A");
    await user.click(screen.getByRole("button", { name: c.remove }));
    await user.click(await screen.findByRole("button", { name: c.removeConfirm.confirm }));
    // flush() started the save; the remove must not have run yet.
    await vi.waitFor(() => expect(mocks.saveCard).toHaveBeenCalled());
    expect(mocks.removeCard).not.toHaveBeenCalled();
    finish({ ok: true, data: { reference: "AG-0123ABCD" } });
    await vi.waitFor(() => expect(mocks.removeCard).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.queryAllByRole("region")).toHaveLength(0));
  });

  test("a failing removeCard keeps the card and shows the error", async () => {
    mocks.removeCard.mockResolvedValue({ ok: false, errorKey: "generic" });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.click(screen.getByRole("button", { name: c.remove }));
    await user.click(await screen.findByRole("button", { name: c.removeConfirm.confirm }));
    expect(await screen.findByText(messages.submit.errors.generic)).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  test("the identification fee reaches the running total", async () => {
    const { user } = renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    const fee = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
      CATALOG.identificationCents / 100,
    );
    const total = screen.getByRole("complementary");
    expect(total).not.toHaveTextContent(fee);
    await user.click(screen.getByRole("radio", { name: c.identification.art }));
    expect(total).toHaveTextContent(fee);
  });
});
