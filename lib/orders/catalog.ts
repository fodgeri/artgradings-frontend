import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_CURRENCY } from "@/lib/money";
import type { Database } from "@/lib/supabase/database.types";

import type { Catalog } from "./types";

/**
 * Loads the active catalog priced in `currency`. Rows without a price in that
 * currency are absent (inner joins), so a half-configured currency offers
 * nothing rather than something unpriced. Throws on a query failure: the
 * caller is a Server Component or action, and Next reports it.
 */
export async function loadCatalog(
  supabase: SupabaseClient<Database>,
  currency: string = DEFAULT_CURRENCY,
): Promise<Catalog> {
  const [services, tiers, addOns, fee, zones] = await Promise.all([
    supabase.from("services").select("key, position, requires_signed").eq("active", true).order("position"),
    supabase
      .from("tiers")
      .select("key, service, position, turnaround_days, tier_prices!inner(amount_cents, max_declared_value_cents)")
      .eq("active", true)
      .eq("tier_prices.currency", currency)
      .order("position"),
    supabase
      .from("add_ons")
      .select("key, position, add_on_services(service), add_on_prices!inner(amount_cents)")
      .eq("active", true)
      .eq("add_on_prices.currency", currency)
      .order("position"),
    supabase
      .from("card_fee_prices")
      .select("amount_cents")
      .eq("fee_key", "identification")
      .eq("currency", currency)
      .maybeSingle(),
    supabase
      .from("shipping_zones")
      .select("key, position, shipping_zone_countries(country_code), shipping_zone_prices!inner(inbound_cents, return_cents)")
      .eq("shipping_zone_prices.currency", currency)
      .order("position"),
  ]);

  const failure = services.error ?? tiers.error ?? addOns.error ?? fee.error ?? zones.error;
  if (failure) throw new Error(`Catalog query failed: ${failure.code ?? "unknown"}`);
  if (!fee.data) throw new Error(`No identification fee in ${currency}`);

  const activeServices = new Set((services.data ?? []).map((s) => s.key));

  return {
    currency,
    services: (services.data ?? []).map((s) => ({
      key: s.key,
      position: s.position,
      requiresSigned: s.requires_signed,
    })),
    tiers: (tiers.data ?? [])
      .filter((t) => activeServices.has(t.service))
      .map((t) => {
        const price = t.tier_prices[0];
        return {
          key: t.key,
          service: t.service,
          position: t.position,
          turnaroundDays: t.turnaround_days,
          amountCents: price.amount_cents,
          maxDeclaredValueCents: price.max_declared_value_cents,
        };
      }),
    addOns: (addOns.data ?? []).map((a) => ({
      key: a.key,
      position: a.position,
      services: a.add_on_services.map((s) => s.service),
      amountCents: a.add_on_prices[0].amount_cents,
    })),
    identificationCents: fee.data.amount_cents,
    zones: (zones.data ?? []).map((z) => ({
      key: z.key,
      countries: z.shipping_zone_countries.map((c) => c.country_code),
      inboundCents: z.shipping_zone_prices[0].inbound_cents,
      returnCents: z.shipping_zone_prices[0].return_cents,
    })),
  };
}
