// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

import { loadOrder, loadOrders } from "./load-orders";

function client(result: { data: unknown; error?: { code?: string } | null }) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "order"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ error: null, ...result }));
  q.then = vi.fn((resolve: (v: unknown) => void) => resolve({ error: null, ...result }));
  const from = vi.fn(() => q);
  return { supabase: { from } as never, q, from };
}

const row = (reference: string, status: string, createdAt: string) => ({
  reference, status, created_at: createdAt, submitted_at: null, total_cents: 100, currency: "EUR",
  order_cards: [{ count: 2 }],
});

describe("loadOrders", () => {
  test("lists the draft first, then the rest newest first, filtered to the caller", async () => {
    const { supabase, q, from } = client({
      data: [
        row("AG-AAAAAAAA", "paid", "2026-10-03"),
        row("AG-BBBBBBBB", "draft", "2026-10-01"),
        row("AG-CCCCCCCC", "cancelled", "2026-10-02"),
      ],
    });

    const orders = await loadOrders(supabase, "user-1");

    expect(orders.map((o) => o.reference)).toEqual(["AG-BBBBBBBB", "AG-AAAAAAAA", "AG-CCCCCCCC"]);
    expect(orders[0]).toMatchObject({ status: "draft", cardCount: 2, totalCents: 100, currency: "EUR" });
    expect(from).toHaveBeenCalledWith("orders");
    expect(q.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  test("throws on a query failure without echoing the message", async () => {
    const { supabase } = client({ data: null, error: { code: "42501" } });
    await expect(loadOrders(supabase, "u")).rejects.toThrow("Orders query failed: 42501");
  });
});

describe("loadOrder", () => {
  const ROW = {
    reference: "AG-AAAAAAAA", status: "paid", shipping_method: "postal",
    contact_first_name: "Ada", contact_last_name: "Lovelace", contact_phone: "+3630123456",
    address_country: "HU", address_postcode: "1011", address_city: "Budapest", address_line: "Fo utca 1",
    currency: "EUR", subtotal_cents: 8000, inbound_cents: 1000, return_cents: 900, total_cents: 9900,
    declared_value_total_cents: 50000, turnaround_days: 20, created_at: "2026-10-01", submitted_at: "2026-10-02",
    order_cards: [
      {
        id: "c1", position: 0, identified_by: "art", release_year: null, brand: null, language: null,
        name: "Zard", set_name: null, card_number: null, surface: null, signed: true, numbered: false,
        declared_value_cents: 50000, service: "dual", tier_key: "dual_standard", price_cents: 8000,
        identification_cents: 500, order_card_add_ons: [{ add_on_key: "digital_grade", price_cents: 300 }],
      },
    ],
    order_status_log: [{ from_status: "draft", to_status: "awaiting_payment", actor: "customer", created_at: "t1" }],
    payment_attempts: [{ provider: "fake", outcome: "succeeded", amount_cents: 9900, currency: "EUR", created_at: "t2" }],
  };

  test("maps everything a printable needs and filters by reference and owner", async () => {
    const { supabase, q } = client({ data: ROW });

    const order = await loadOrder(supabase, "AG-AAAAAAAA", "user-1");

    expect(q.eq).toHaveBeenCalledWith("reference", "AG-AAAAAAAA");
    expect(q.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toMatchObject({
      reference: "AG-AAAAAAAA", status: "paid", shippingMethod: "postal",
      contact: { firstName: "Ada", lastName: "Lovelace", phone: "+3630123456" },
      address: { country: "HU", postcode: "1011", city: "Budapest", line: "Fo utca 1" },
      subtotalCents: 8000, inboundCents: 1000, returnCents: 900, totalCents: 9900,
      declaredValueTotalCents: 50000, turnaroundDays: 20, submittedAt: "2026-10-02",
    });
    expect(order?.cards[0]).toMatchObject({
      identifiedBy: "art", priceCents: 8000, identificationCents: 500,
      addOns: [{ key: "digital_grade", priceCents: 300 }],
    });
    expect(order?.log).toEqual([
      { fromStatus: "draft", toStatus: "awaiting_payment", actor: "customer", createdAt: "t1" },
    ]);
    expect(order?.payments[0]).toMatchObject({ outcome: "succeeded", amountCents: 9900 });
  });

  test("is null when the order is not the caller's", async () => {
    const { supabase } = client({ data: null });
    expect(await loadOrder(supabase, "AG-AAAAAAAA", "user-2")).toBeNull();
  });
});
