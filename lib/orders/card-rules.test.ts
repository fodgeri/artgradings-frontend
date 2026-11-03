import { describe, expect, test } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "./fixtures";
import {
  applicableAddOns,
  availableServices,
  availableTiers,
  cardProblems,
  CARD_LANGUAGES,
  normalizeCard,
} from "./card-rules";
import type { DraftCard } from "./types";

const [CUSTOMER_CARD, ART_CARD] = REFERENCE_DRAFT.cards;
const NOW = new Date("2026-10-28T12:00:00Z");

const with_ = (card: DraftCard, patch: Partial<DraftCard>): DraftCard => ({ ...card, ...patch });

describe("cardProblems", () => {
  test("a complete customer-identified card has none", () => {
    expect(cardProblems(CUSTOMER_CARD, CATALOG, NOW)).toEqual([]);
  });

  test("a customer-identified card needs every identification field", () => {
    expect(cardProblems(with_(CUSTOMER_CARD, { brand: null }), CATALOG, NOW)).toEqual(["brandMissing"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { releaseYear: null }), CATALOG, NOW)).toEqual(["yearMissing"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { language: null }), CATALOG, NOW)).toEqual(["languageMissing"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { name: "  " }), CATALOG, NOW)).toEqual(["nameMissing"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { setName: null }), CATALOG, NOW)).toEqual(["setMissing"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { cardNumber: "" }), CATALOG, NOW)).toEqual(["cardNumberMissing"]);
  });

  test("an ART-identified card needs only value, service and tier", () => {
    const bare = with_(ART_CARD, {});
    expect(cardProblems(bare, CATALOG, NOW)).toEqual([]);
    expect(cardProblems(with_(bare, { declaredValueCents: null, service: null, tierKey: null }), CATALOG, NOW))
      .toEqual(["valueMissing", "serviceMissing", "tierMissing"]);
  });

  test("a non-positive declared value is missing", () => {
    expect(cardProblems(with_(CUSTOMER_CARD, { declaredValueCents: 0 }), CATALOG, NOW)).toEqual(["valueMissing"]);
  });

  test("an autograph service on an unsigned card needs signed", () => {
    const card = with_(CUSTOMER_CARD, { service: "dual", tierKey: "dual_standard", signed: false });
    expect(cardProblems(card, CATALOG, NOW)).toEqual(["serviceNeedsSigned"]);
    expect(cardProblems(with_(card, { signed: true }), CATALOG, NOW)).toEqual([]);
  });

  test("a tier that does not belong to the service is missing", () => {
    expect(cardProblems(with_(CUSTOMER_CARD, { tierKey: "dual_standard" }), CATALOG, NOW)).toEqual(["tierMissing"]);
  });

  test("a card above every tier cap reports overCap", () => {
    // grading_standard has no cap, so only the capped tier can trip it.
    const card = with_(CUSTOMER_CARD, { tierKey: "grading_express", declaredValueCents: 150000 });
    expect(cardProblems(card, CATALOG, NOW)).toEqual(["overCap"]);
    expect(cardProblems(with_(card, { declaredValueCents: 100000 }), CATALOG, NOW)).toEqual([]);
    expect(cardProblems(with_(card, { tierKey: "grading_standard" }), CATALOG, NOW)).toEqual([]);
  });

  test("release year next year is allowed, the year after is not", () => {
    expect(cardProblems(with_(CUSTOMER_CARD, { releaseYear: 2027 }), CATALOG, NOW)).toEqual([]);
    expect(cardProblems(with_(CUSTOMER_CARD, { releaseYear: 2028 }), CATALOG, NOW)).toEqual(["yearOutOfRange"]);
    expect(cardProblems(with_(CUSTOMER_CARD, { releaseYear: 1880 }), CATALOG, NOW)).toEqual([]);
    expect(cardProblems(with_(CUSTOMER_CARD, { releaseYear: 1879 }), CATALOG, NOW)).toEqual(["yearOutOfRange"]);
  });

  test("a year hint on an ART-identified card is still range-checked", () => {
    expect(cardProblems(with_(ART_CARD, { releaseYear: 3000 }), CATALOG, NOW)).toEqual(["yearOutOfRange"]);
  });
});

describe("availableServices", () => {
  test("autograph and dual are offered only on signed cards", () => {
    expect(availableServices(false, CATALOG).map((s) => s.key)).toEqual(["grading", "authentication"]);
    expect(availableServices(true, CATALOG).map((s) => s.key)).toEqual(["grading", "autograph", "dual", "authentication"]);
  });
});

describe("applicableAddOns", () => {
  test("lists add-ons that apply to the service", () => {
    expect(applicableAddOns("grading", CATALOG).map((a) => a.key)).toEqual(["digital_grade"]);
    expect(applicableAddOns("authentication", CATALOG)).toEqual([]);
    expect(applicableAddOns(null, CATALOG)).toEqual([]);
  });
});

describe("availableTiers", () => {
  test("lists the tiers of the service", () => {
    expect(availableTiers("grading", null, CATALOG).map((t) => t.key)).toEqual(["grading_standard", "grading_express"]);
    expect(availableTiers(null, null, CATALOG)).toEqual([]);
  });

  test("a value filters out tiers whose cap is below it", () => {
    expect(availableTiers("grading", 100000, CATALOG).map((t) => t.key)).toEqual(["grading_standard", "grading_express"]);
    expect(availableTiers("grading", 100001, CATALOG).map((t) => t.key)).toEqual(["grading_standard"]);
  });
});

describe("normalizeCard", () => {
  const dual = with_(CUSTOMER_CARD, {
    signed: true, service: "dual", tierKey: "dual_standard", addOnKeys: ["digital_grade"],
  });

  test("clears dual, its tier and its add-ons when signed is unticked", () => {
    const out = normalizeCard(with_(dual, { signed: false }), CATALOG);
    expect(out.service).toBeNull();
    expect(out.tierKey).toBeNull();
    // add-ons applicable to "no service" are none
    expect(out.addOnKeys).toEqual([]);
  });

  test("leaves a valid card untouched", () => {
    expect(normalizeCard(dual, CATALOG)).toEqual(dual);
  });

  test("clears a tier that is not offered for the service", () => {
    const out = normalizeCard(with_(CUSTOMER_CARD, { tierKey: "dual_standard" }), CATALOG);
    expect(out.service).toBe("grading");
    expect(out.tierKey).toBeNull();
  });

  test("drops add-ons that do not apply to the service", () => {
    const out = normalizeCard(
      with_(CUSTOMER_CARD, { service: "authentication", tierKey: "authentication_standard" }), CATALOG);
    expect(out.addOnKeys).toEqual([]);
    expect(out.tierKey).toBe("authentication_standard");
  });

  test("drops unknown add-on keys", () => {
    expect(normalizeCard(with_(CUSTOMER_CARD, { addOnKeys: ["digital_grade", "nope"] }), CATALOG).addOnKeys)
      .toEqual(["digital_grade"]);
  });

  test("keeps a tier whose cap the declared value exceeds, so overCap can report it", () => {
    const card = with_(CUSTOMER_CARD, { tierKey: "grading_express", declaredValueCents: 150000 });
    expect(normalizeCard(card, CATALOG).tierKey).toBe("grading_express");
  });

  test("keeps what was typed when switching identification mode", () => {
    const card = with_(CUSTOMER_CARD, { identifiedBy: "art" });
    expect(normalizeCard(card, CATALOG)).toEqual(card);
  });
});

test("languages are two-letter codes", () => {
  for (const code of CARD_LANGUAGES) expect(code).toMatch(/^[a-z]{2}$/);
});
