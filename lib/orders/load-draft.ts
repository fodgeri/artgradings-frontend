import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { Draft, DraftCard, DraftShipping, IdentifiedBy, ShippingMethod } from "./types";

/**
 * The signed-in customer's draft, or null. RLS limits `orders` to their own
 * rows; the filter picks the draft among them. Throws on a query failure.
 */
export async function loadDraft(supabase: SupabaseClient<Database>): Promise<Draft | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `reference, currency, shipping_method, contact_first_name, contact_last_name, contact_phone,
       address_country, address_postcode, address_city, address_line, inbound_insurance_confirmed,
       order_cards(id, position, identified_by, release_year, brand, language, name, set_name,
         card_number, surface, signed, numbered, declared_value_cents, service, tier_key,
         order_card_add_ons(add_on_key), card_photos(id))`,
    )
    .eq("status", "draft")
    .order("position", { referencedTable: "order_cards" })
    .maybeSingle();

  if (error) throw new Error(`Draft query failed: ${error.code ?? "unknown"}`);
  if (!data) return null;

  const cards: DraftCard[] = data.order_cards.map((c) => ({
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
    addOnKeys: c.order_card_add_ons.map((a) => a.add_on_key),
    // card_photos is unique per card, so PostgREST embeds one object or null.
    photo: c.card_photos ? { id: c.card_photos.id } : null,
  }));

  return {
    reference: data.reference,
    currency: data.currency,
    cards,
    shipping: {
      method: data.shipping_method as ShippingMethod | null,
      firstName: data.contact_first_name,
      lastName: data.contact_last_name,
      phone: data.contact_phone,
      country: data.address_country,
      postcode: data.address_postcode,
      city: data.address_city,
      addressLine: data.address_line,
      inboundInsuranceConfirmed: data.inbound_insurance_confirmed,
    },
  };
}

/**
 * Contact and address from the customer's most recent submitted order,
 * otherwise their profile names. Never throws: a prefill is a convenience.
 */
export async function loadPrefill(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Partial<DraftShipping>> {
  const { data: last } = await supabase
    .from("orders")
    .select(
      "contact_first_name, contact_last_name, contact_phone, address_country, address_postcode, address_city, address_line",
    )
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    return {
      firstName: last.contact_first_name,
      lastName: last.contact_last_name,
      phone: last.contact_phone,
      country: last.address_country,
      postcode: last.address_postcode,
      city: last.address_city,
      addressLine: last.address_line,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  return profile ? { firstName: profile.first_name, lastName: profile.last_name } : {};
}
