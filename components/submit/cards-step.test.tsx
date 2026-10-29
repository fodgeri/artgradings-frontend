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
    expect(screen.getByRole("button", { name: c.identification.customer })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

  test("Next is disabled while a card has problems", () => {
    renderWithIntl(<CardsStep initialDraft={null} catalog={CATALOG} />);
    expect(screen.getByRole("button", { name: c.next })).toBeDisabled();
    expect(screen.getByText(c.incomplete)).toBeInTheDocument();
  });

  test("switching back to entering details makes the empty fields block Next", async () => {
    const art: Draft = { ...REFERENCE_DRAFT, cards: [REFERENCE_DRAFT.cards[1]] };
    const { user } = renderWithIntl(<CardsStep initialDraft={art} catalog={CATALOG} />);
    expect(screen.getByRole("button", { name: c.next })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: c.identification.customer }));
    expect(screen.getByRole("button", { name: c.next })).toBeDisabled();
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

  test("Next does not navigate when a save fails", async () => {
    mocks.saveCard.mockResolvedValue({ ok: false, errorKey: "generic" });
    const { user } = renderWithIntl(<CardsStep initialDraft={complete} catalog={CATALOG} />);
    await user.type(screen.getByLabelText(c.fields.optional.replace("{label}", c.fields.surface)), "Holo");
    await user.click(screen.getByRole("button", { name: c.next }));
    expect(await screen.findByText(c.nextFailed)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
