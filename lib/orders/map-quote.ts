import type { Quote } from "./types";

/** The RPC's snake_case JSON as a camelCase `Quote`. */
export function mapQuote(raw: unknown): Quote {
  const q = raw as {
    currency: string;
    cards: { card_id: string; price_cents: number; identification_cents: number }[];
    subtotal_cents: number;
    inbound_cents: number;
    return_cents: number;
    total_cents: number;
    declared_value_total_cents: number;
    turnaround_days: number | null;
  };
  return {
    currency: q.currency,
    cards: q.cards.map((c) => ({
      cardId: c.card_id,
      priceCents: c.price_cents,
      identificationCents: c.identification_cents,
    })),
    subtotalCents: q.subtotal_cents,
    inboundCents: q.inbound_cents,
    returnCents: q.return_cents,
    totalCents: q.total_cents,
    declaredValueTotalCents: q.declared_value_total_cents,
    turnaroundDays: q.turnaround_days,
  };
}
