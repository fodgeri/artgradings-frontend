import { describe, expect, test } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "./fixtures";
import { quoteDraft } from "./pricing";
import type { Draft, DraftCard } from "./types";

const [A, B] = REFERENCE_DRAFT.cards;
const draftOf = (cards: DraftCard[], shipping: Partial<Draft["shipping"]> = {}): Draft => ({
  ...REFERENCE_DRAFT,
  cards,
  shipping: { ...REFERENCE_DRAFT.shipping, ...shipping },
});

describe("quoteDraft", () => {
  test("matches the SQL pricing for the reference order", () => {
    expect(quoteDraft(REFERENCE_DRAFT, CATALOG)).toMatchObject({
      currency: "EUR",
      subtotalCents: 450,
      inboundCents: 10,
      returnCents: 20,
      totalCents: 480,
      declaredValueTotalCents: 130000,
      turnaroundDays: 30,
    });
  });

  test("an ART-identified card carries the identification fee", () => {
    const quote = quoteDraft(REFERENCE_DRAFT, CATALOG);
    expect(quote.cards).toEqual([
      { cardId: A.id, priceCents: 150, identificationCents: 0 },
      { cardId: B.id, priceCents: 300, identificationCents: 200 },
    ]);
  });

  test("the fee shows before the card is complete", () => {
    const quote = quoteDraft(draftOf([{ ...B, tierKey: null }]), CATALOG);
    expect(quote.cards).toEqual([{ cardId: B.id, priceCents: null, identificationCents: 200 }]);
    expect(quote.subtotalCents).toBe(200);
    expect(quote.turnaroundDays).toBeNull();
  });

  test("an incomplete customer-identified card contributes nothing", () => {
    const quote = quoteDraft(draftOf([{ ...A, service: null, tierKey: null }]), CATALOG);
    expect(quote.cards).toEqual([{ cardId: A.id, priceCents: null, identificationCents: 0 }]);
    expect(quote.subtotalCents).toBe(0);
  });

  test("ignores an add-on that does not apply to the card's service", () => {
    const card = { ...A, service: "authentication", tierKey: "authentication_standard", addOnKeys: ["digital_grade"] };
    expect(quoteDraft(draftOf([card]), CATALOG).cards[0].priceCents).toBe(100);
  });

  test("a tier over its cap is not priced", () => {
    const card = { ...A, tierKey: "grading_express", declaredValueCents: 150000, addOnKeys: [] };
    expect(quoteDraft(draftOf([card]), CATALOG).cards[0].priceCents).toBeNull();
  });

  test("a service that needs a signed card is not priced on an unsigned one", () => {
    const card = { ...A, service: "dual", tierKey: "dual_standard", signed: false, addOnKeys: [] };
    expect(quoteDraft(draftOf([card]), CATALOG).cards[0].priceCents).toBeNull();
  });

  test("turnaround is the longest tier", () => {
    const fast = { ...A, tierKey: "grading_express", addOnKeys: [] };
    expect(quoteDraft(draftOf([fast]), CATALOG).turnaroundDays).toBe(10);
    expect(quoteDraft(draftOf([fast, B]), CATALOG).turnaroundDays).toBe(15);
  });

  test("in-person orders carry no fees", () => {
    const quote = quoteDraft(draftOf([A, B], { method: "in_person" }), CATALOG);
    expect(quote).toMatchObject({ inboundCents: 0, returnCents: 0, subtotalCents: 450, totalCents: 450 });
  });

  test("fees are zero while no shipping method or country is set", () => {
    expect(quoteDraft(draftOf([A], { method: null }), CATALOG)).toMatchObject({ inboundCents: 0, returnCents: 0 });
    expect(quoteDraft(draftOf([A], { country: null }), CATALOG)).toMatchObject({ inboundCents: 0, returnCents: 0 });
    expect(quoteDraft(draftOf([A], { country: "US" }), CATALOG)).toMatchObject({ inboundCents: 0, returnCents: 0 });
  });

  test("an empty draft quotes zero", () => {
    expect(quoteDraft(draftOf([]), CATALOG)).toMatchObject({
      subtotalCents: 0, declaredValueTotalCents: 0, turnaroundDays: null,
    });
  });
});
