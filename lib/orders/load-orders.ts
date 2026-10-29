import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { OrderStatus } from "./status";
import type { IdentifiedBy, ShippingMethod } from "./types";

export type OrderSummary = {
  reference: string;
  status: OrderStatus;
  createdAt: string;
  submittedAt: string | null;
  cardCount: number;
  totalCents: number | null;
  currency: string;
};

export type OrderDetailCard = {
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
  priceCents: number | null;
  identificationCents: number | null;
  addOns: { key: string; priceCents: number | null }[];
};

/** Everything the order page and the printables (label, form) draw from. */
export type OrderDetail = {
  reference: string;
  status: OrderStatus;
  shippingMethod: ShippingMethod | null;
  contact: { firstName: string | null; lastName: string | null; phone: string | null };
  address: {
    country: string | null;
    postcode: string | null;
    city: string | null;
    line: string | null;
  };
  currency: string;
  subtotalCents: number | null;
  inboundCents: number | null;
  returnCents: number | null;
  totalCents: number | null;
  declaredValueTotalCents: number | null;
  turnaroundDays: number | null;
  createdAt: string;
  submittedAt: string | null;
  cards: OrderDetailCard[];
  log: { fromStatus: string | null; toStatus: string; actor: string; createdAt: string }[];
  payments: {
    provider: string;
    outcome: string | null;
    amountCents: number;
    currency: string;
    createdAt: string;
  }[];
};

/**
 * The customer's orders: the draft first, then the rest newest first.
 * `userId` (from `requireUser()`) is a second filter on top of RLS. Throws on
 * a query failure.
 */
export async function loadOrders(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("reference, status, created_at, submitted_at, total_cents, currency, order_cards(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Orders query failed: ${error.code ?? "unknown"}`);

  const orders = (data ?? []).map(
    (o): OrderSummary => ({
      reference: o.reference,
      status: o.status as OrderStatus,
      createdAt: o.created_at,
      submittedAt: o.submitted_at,
      cardCount: o.order_cards[0]?.count ?? 0,
      totalCents: o.total_cents,
      currency: o.currency,
    }),
  );
  // Array.prototype.sort is stable: the rest keep their created_at order.
  return orders.sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft"));
}

/**
 * One order with its cards, status log and payment attempts, or null when it
 * is not the caller's. Throws on a query failure.
 */
export async function loadOrder(
  supabase: SupabaseClient<Database>,
  reference: string,
  userId: string,
): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `reference, status, shipping_method, contact_first_name, contact_last_name, contact_phone,
       address_country, address_postcode, address_city, address_line, currency, subtotal_cents,
       inbound_cents, return_cents, total_cents, declared_value_total_cents, turnaround_days,
       created_at, submitted_at,
       order_cards(id, position, identified_by, release_year, brand, language, name, set_name,
         card_number, surface, signed, numbered, declared_value_cents, service, tier_key,
         price_cents, identification_cents, order_card_add_ons(add_on_key, price_cents)),
       order_status_log(from_status, to_status, actor, created_at),
       payment_attempts(provider, outcome, amount_cents, currency, created_at)`,
    )
    .eq("reference", reference)
    .eq("user_id", userId)
    .order("position", { referencedTable: "order_cards" })
    .order("created_at", { referencedTable: "order_status_log" })
    .order("created_at", { referencedTable: "payment_attempts" })
    .maybeSingle();

  if (error) throw new Error(`Order query failed: ${error.code ?? "unknown"}`);
  if (!data) return null;

  return {
    reference: data.reference,
    status: data.status as OrderStatus,
    shippingMethod: data.shipping_method as ShippingMethod | null,
    contact: {
      firstName: data.contact_first_name,
      lastName: data.contact_last_name,
      phone: data.contact_phone,
    },
    address: {
      country: data.address_country,
      postcode: data.address_postcode,
      city: data.address_city,
      line: data.address_line,
    },
    currency: data.currency,
    subtotalCents: data.subtotal_cents,
    inboundCents: data.inbound_cents,
    returnCents: data.return_cents,
    totalCents: data.total_cents,
    declaredValueTotalCents: data.declared_value_total_cents,
    turnaroundDays: data.turnaround_days,
    createdAt: data.created_at,
    submittedAt: data.submitted_at,
    cards: data.order_cards.map((c) => ({
      id: c.id,
      position: c.position,
      identifiedBy: c.identified_by as IdentifiedBy,
      releaseYear: c.release_year,
      brand: c.brand,
      language: c.language,
      name: c.name,
      setName: c.set_name,
      cardNumber: c.card_number,
      surface: c.surface,
      signed: c.signed,
      numbered: c.numbered,
      declaredValueCents: c.declared_value_cents,
      service: c.service,
      tierKey: c.tier_key,
      priceCents: c.price_cents,
      identificationCents: c.identification_cents,
      addOns: c.order_card_add_ons.map((a) => ({ key: a.add_on_key, priceCents: a.price_cents })),
    })),
    log: data.order_status_log.map((l) => ({
      fromStatus: l.from_status,
      toStatus: l.to_status,
      actor: l.actor,
      createdAt: l.created_at,
    })),
    payments: data.payment_attempts.map((p) => ({
      provider: p.provider,
      outcome: p.outcome,
      amountCents: p.amount_cents,
      currency: p.currency,
      createdAt: p.created_at,
    })),
  };
}
