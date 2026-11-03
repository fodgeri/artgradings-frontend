export type IdentifiedBy = "customer" | "art";
export type ShippingMethod = "postal" | "in_person";

/** Service keys are plain strings: services are data, not an enum. */
export type DraftCard = {
  id: string;
  position: number;
  identifiedBy: IdentifiedBy;
  releaseYear: number | null;
  brand: string | null;
  language: string | null;
  name: string | null;
  setName: string | null;
  cardNumber: string | null;
  surface: string | null;
  signed: boolean;
  numbered: boolean;
  declaredValueCents: number | null;
  service: string | null;
  tierKey: string | null;
  addOnKeys: string[];
  photo: { id: string } | null;
};

export type DraftShipping = {
  method: ShippingMethod | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
  postcode: string | null;
  city: string | null;
  addressLine: string | null;
  inboundInsuranceConfirmed: boolean;
};

export type Draft = {
  reference: string;
  currency: string;
  cards: DraftCard[];
  shipping: DraftShipping;
};

export type Catalog = {
  currency: string;
  services: { key: string; position: number; requiresSigned: boolean }[];
  tiers: {
    key: string;
    service: string;
    position: number;
    turnaroundDays: number;
    amountCents: number;
    maxDeclaredValueCents: number | null;
  }[];
  addOns: { key: string; position: number; services: string[]; amountCents: number }[];
  identificationCents: number;
  zones: { key: string; countries: string[]; inboundCents: number; returnCents: number }[];
};

export type Quote = {
  currency: string;
  cards: { cardId: string; priceCents: number | null; identificationCents: number }[];
  subtotalCents: number;
  inboundCents: number;
  returnCents: number;
  totalCents: number;
  declaredValueTotalCents: number;
  turnaroundDays: number | null;
};

/** What the editor sends to `saveCard`: a card without its photo, plus whether an earlier save of it has landed. */
export type DraftCardInput = Omit<DraftCard, "photo"> & { persisted: boolean };
