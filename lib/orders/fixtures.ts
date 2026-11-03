import type { Catalog, Draft } from "./types";

/**
 * Mirrors the placeholder catalog rows in
 * `20261029084405_order_catalog.sql`. Shared by the TypeScript tests so that
 * TS and SQL pricing are checked against the same numbers.
 */
export const CATALOG: Catalog = {
  currency: "EUR",
  services: [
    { key: "grading", position: 0, requiresSigned: false },
    { key: "autograph", position: 1, requiresSigned: true },
    { key: "dual", position: 2, requiresSigned: true },
    { key: "authentication", position: 3, requiresSigned: false },
  ],
  tiers: [
    { key: "grading_standard", service: "grading", position: 0, turnaroundDays: 30, amountCents: 100, maxDeclaredValueCents: null },
    { key: "grading_express", service: "grading", position: 1, turnaroundDays: 10, amountCents: 200, maxDeclaredValueCents: 100000 },
    { key: "autograph_standard", service: "autograph", position: 0, turnaroundDays: 30, amountCents: 100, maxDeclaredValueCents: null },
    { key: "dual_standard", service: "dual", position: 0, turnaroundDays: 30, amountCents: 150, maxDeclaredValueCents: null },
    { key: "authentication_standard", service: "authentication", position: 0, turnaroundDays: 15, amountCents: 100, maxDeclaredValueCents: null },
  ],
  addOns: [{ key: "digital_grade", position: 0, services: ["grading", "dual"], amountCents: 50 }],
  identificationCents: 200,
  zones: [
    { key: "placeholder_eu", countries: ["HU", "AT", "DE", "SK"], inboundCents: 10, returnCents: 20 },
  ],
};

/** Mirrors the draft in `supabase/tests/090-order-functions.sql` (cards A and B). */
export const REFERENCE_DRAFT: Draft = {
  reference: "AG-0123ABCD",
  currency: "EUR",
  cards: [
    {
      id: "00000000-0000-0000-0000-00000000000a",
      position: 0,
      identifiedBy: "customer",
      releaseYear: 1999,
      brand: "Pokemon",
      language: "en",
      name: "Charizard",
      setName: "Base Set",
      cardNumber: "4/102",
      surface: null,
      signed: false,
      numbered: false,
      declaredValueCents: 40000,
      service: "grading",
      tierKey: "grading_standard",
      addOnKeys: ["digital_grade"],
      photo: null,
    },
    {
      id: "00000000-0000-0000-0000-00000000000b",
      position: 1,
      identifiedBy: "art",
      releaseYear: null,
      brand: null,
      language: null,
      name: null,
      setName: null,
      cardNumber: null,
      surface: null,
      signed: false,
      numbered: false,
      declaredValueCents: 90000,
      service: "authentication",
      tierKey: "authentication_standard",
      addOnKeys: [],
      photo: null,
    },
  ],
  shipping: {
    method: "postal",
    firstName: "Alice",
    lastName: "Example",
    phone: "+36 1 234 5678",
    country: "HU",
    postcode: "1011",
    city: "Budapest",
    addressLine: "Fo utca 1",
    inboundInsuranceConfirmed: true,
  },
};
