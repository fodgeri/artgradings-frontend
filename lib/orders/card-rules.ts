import type { Catalog, DraftCard } from "./types";

export const MAX_CARDS_PER_ORDER = 50;
export const CARD_TEXT_MAX = 200; // name, set name
export const BRAND_MAX = 100;
export const SURFACE_MAX = 100;
export const CARD_NUMBER_MAX = 50;
export const RELEASE_YEAR_MIN = 1880;
export const DECLARED_VALUE_MAX_CENTS = 1_000_000_000; // EUR 10M
/** ISO 639-1. Named in the UI with `Intl.DisplayNames`. */
export const CARD_LANGUAGES = [
  "en", "ja", "ko", "zh", "de", "fr", "it", "es", "pt", "nl", "pl", "ru",
] as const;

/** Required when the customer identifies the card; optional hints otherwise. */
export const IDENTIFICATION_FIELDS = [
  "releaseYear", "brand", "language", "name", "setName", "cardNumber",
] as const;

export type CardProblem =
  | "yearMissing"
  | "yearOutOfRange"
  | "brandMissing"
  | "languageMissing"
  | "nameMissing"
  | "setMissing"
  | "cardNumberMissing"
  | "valueMissing"
  | "serviceMissing"
  | "serviceNeedsSigned"
  | "tierMissing"
  | "overCap";

const blank = (v: string | null) => v === null || v.trim() === "";

export function cardProblems(card: DraftCard, catalog: Catalog, now: Date = new Date()): CardProblem[] {
  const problems: CardProblem[] = [];

  if (card.identifiedBy === "customer") {
    if (card.releaseYear === null) problems.push("yearMissing");
    if (blank(card.brand)) problems.push("brandMissing");
    if (blank(card.language)) problems.push("languageMissing");
    if (blank(card.name)) problems.push("nameMissing");
    if (blank(card.setName)) problems.push("setMissing");
    if (blank(card.cardNumber)) problems.push("cardNumberMissing");
  }
  if (
    card.releaseYear !== null &&
    (card.releaseYear < RELEASE_YEAR_MIN || card.releaseYear > now.getFullYear() + 1)
  ) {
    problems.push("yearOutOfRange");
  }

  if (card.declaredValueCents === null || card.declaredValueCents <= 0) problems.push("valueMissing");

  const service = catalog.services.find((s) => s.key === card.service);
  if (card.service === null || !service) problems.push("serviceMissing");
  else if (service.requiresSigned && !card.signed) problems.push("serviceNeedsSigned");

  const tier = catalog.tiers.find((t) => t.key === card.tierKey && t.service === card.service);
  if (!tier) problems.push("tierMissing");
  else if (
    tier.maxDeclaredValueCents !== null &&
    card.declaredValueCents !== null &&
    card.declaredValueCents > tier.maxDeclaredValueCents
  ) {
    problems.push("overCap");
  }

  return problems;
}

export function availableServices(signed: boolean, catalog: Catalog): Catalog["services"] {
  return catalog.services.filter((s) => signed || !s.requiresSigned);
}

export function applicableAddOns(service: string | null, catalog: Catalog): Catalog["addOns"] {
  if (service === null) return [];
  return catalog.addOns.filter((a) => a.services.includes(service));
}

/** Tiers of the service; with a value, only those whose cap covers it. */
export function availableTiers(
  service: string | null,
  declaredValueCents: number | null,
  catalog: Catalog,
): Catalog["tiers"] {
  if (service === null) return [];
  return catalog.tiers.filter(
    (t) =>
      t.service === service &&
      (declaredValueCents === null ||
        t.maxDeclaredValueCents === null ||
        declaredValueCents <= t.maxDeclaredValueCents),
  );
}

/**
 * Makes a card internally consistent after any edit. Applied by the editor and
 * by `saveCard`. It never touches identification fields, and it keeps a tier
 * whose cap the declared value exceeds: `cardProblems` reports `overCap`
 * rather than silently changing what the customer chose.
 */
export function normalizeCard(card: DraftCard, catalog: Catalog): DraftCard {
  let { service, tierKey } = card;

  if (service !== null && !availableServices(card.signed, catalog).some((s) => s.key === service)) {
    service = null;
    tierKey = null;
  }
  if (tierKey !== null && !availableTiers(service, null, catalog).some((t) => t.key === tierKey)) {
    tierKey = null;
  }
  const applicable = new Set(applicableAddOns(service, catalog).map((a) => a.key));
  const addOnKeys = card.addOnKeys.filter((k) => applicable.has(k));

  return { ...card, service, tierKey, addOnKeys };
}
