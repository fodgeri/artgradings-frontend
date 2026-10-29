// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

import { loadDraft, loadPrefill } from "./load-draft";

/** A chainable query whose every method returns itself and which resolves to `result`. */
function client(...results: { data: unknown; error?: { code?: string } | null }[]) {
  const queries: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const from = vi.fn((table: string) => {
    const result = results.shift() ?? { data: null, error: null };
    const q: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ["select", "eq", "not", "order", "limit"]) q[m] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => ({ error: null, ...result }));
    q.table = vi.fn(() => table);
    queries.push(q);
    return q;
  });
  return { supabase: { from } as never, from, queries };
}

const ROW = {
  reference: "AG-0123ABCD",
  currency: "EUR",
  shipping_method: "postal",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_phone: "+3630123456",
  address_country: "HU",
  address_postcode: "1011",
  address_city: "Budapest",
  address_line: "Fo utca 1",
  inbound_insurance_confirmed: true,
  order_cards: [
    {
      id: "c1", position: 0, identified_by: "art", release_year: null, brand: null, language: null,
      name: "Zard", set_name: null, card_number: null, surface: null, signed: true, numbered: false,
      declared_value_cents: 1000, service: "dual", tier_key: "dual_standard",
      order_card_add_ons: [{ add_on_key: "digital_grade" }],
      card_photos: { id: "p1" },
    },
    {
      id: "c2", position: 1, identified_by: "customer", release_year: 1999, brand: "Pokemon",
      language: "en", name: "X", set_name: "S", card_number: "1", surface: "mint", signed: false,
      numbered: true, declared_value_cents: 5, service: null, tier_key: null,
      order_card_add_ons: [], card_photos: null,
    },
  ],
};

describe("loadDraft", () => {
  test("maps a draft with its cards, add-ons, photo and shipping", async () => {
    const { supabase, queries } = client({ data: ROW });

    const draft = await loadDraft(supabase);

    expect(draft?.reference).toBe("AG-0123ABCD");
    expect(draft?.shipping).toEqual({
      method: "postal", firstName: "Ada", lastName: "Lovelace", phone: "+3630123456",
      country: "HU", postcode: "1011", city: "Budapest", addressLine: "Fo utca 1",
      inboundInsuranceConfirmed: true,
    });
    expect(draft?.cards[0]).toMatchObject({
      id: "c1", identifiedBy: "art", setName: null, tierKey: "dual_standard",
      addOnKeys: ["digital_grade"], photo: { id: "p1" }, declaredValueCents: 1000,
    });
    expect(draft?.cards[1]).toMatchObject({ addOnKeys: [], photo: null, surface: "mint" });
    expect(queries[0].eq).toHaveBeenCalledWith("status", "draft");
    expect(queries[0].order).toHaveBeenCalledWith("position", { referencedTable: "order_cards" });
  });

  test("is null when there is no draft", async () => {
    expect(await loadDraft(client({ data: null }).supabase)).toBeNull();
  });

  test("throws on a query failure, naming only the code", async () => {
    await expect(loadDraft(client({ data: null, error: { code: "42P01" } }).supabase)).rejects.toThrow(
      "Draft query failed: 42P01",
    );
  });
});

describe("loadPrefill", () => {
  test("prefers the most recent submitted order", async () => {
    const { supabase, from } = client({
      data: {
        contact_first_name: "Ada", contact_last_name: "L", contact_phone: "123456",
        address_country: "AT", address_postcode: "1", address_city: "Wien", address_line: "Ring 1",
      },
    });

    expect(await loadPrefill(supabase, "u1")).toEqual({
      firstName: "Ada", lastName: "L", phone: "123456", country: "AT",
      postcode: "1", city: "Wien", addressLine: "Ring 1",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  test("falls back to the profile names", async () => {
    const { supabase, from, queries } = client(
      { data: null },
      { data: { first_name: "Grace", last_name: "Hopper" } },
    );

    expect(await loadPrefill(supabase, "u1")).toEqual({ firstName: "Grace", lastName: "Hopper" });
    expect(from).toHaveBeenLastCalledWith("profiles");
    expect(queries[1].eq).toHaveBeenCalledWith("id", "u1");
  });

  test("is empty when there is neither", async () => {
    expect(await loadPrefill(client({ data: null }, { data: null }).supabase, "u1")).toEqual({});
  });
});
