import type { Catalog, Draft, Quote } from "./types";

/**
 * The display mirror of `private.price_order`. The database is authoritative
 * and re-prices at submit; this runs on every keystroke, so it is tolerant:
 * a card that cannot be priced yet gets `priceCents: null` and contributes
 * nothing, except its identification fee, which shows as soon as the customer
 * picks "ART identifies it". Shipping fees are 0 for in-person orders and
 * while no (supported) country is set.
 *
 * `priceCents` includes add-ons and the identification fee, as in SQL.
 */
export function quoteDraft(draft: Draft, catalog: Catalog): Quote {
  let subtotalCents = 0;
  let declaredValueTotalCents = 0;
  let turnaroundDays: number | null = null;

  const cards = draft.cards.map((card) => {
    const identificationCents = card.identifiedBy === "art" ? catalog.identificationCents : 0;
    declaredValueTotalCents += card.declaredValueCents ?? 0;

    const service = catalog.services.find((s) => s.key === card.service);
    const tier = catalog.tiers.find((t) => t.key === card.tierKey && t.service === card.service);
    const priceable =
      service !== undefined &&
      (!service.requiresSigned || card.signed) &&
      tier !== undefined &&
      (tier.maxDeclaredValueCents === null ||
        card.declaredValueCents === null ||
        card.declaredValueCents <= tier.maxDeclaredValueCents);

    if (!priceable) {
      subtotalCents += identificationCents;
      return { cardId: card.id, priceCents: null, identificationCents };
    }

    const addOns = catalog.addOns
      .filter((a) => card.addOnKeys.includes(a.key) && a.services.includes(tier.service))
      .reduce((sum, a) => sum + a.amountCents, 0);
    const priceCents = tier.amountCents + addOns + identificationCents;

    subtotalCents += priceCents;
    turnaroundDays = Math.max(turnaroundDays ?? 0, tier.turnaroundDays);
    return { cardId: card.id, priceCents, identificationCents };
  });

  const { country, method } = draft.shipping;
  const zone =
    method === "postal" && country !== null
      ? catalog.zones.find((z) => z.countries.includes(country))
      : undefined;
  const inboundCents = zone?.inboundCents ?? 0;
  const returnCents = zone?.returnCents ?? 0;

  return {
    currency: draft.currency,
    cards,
    subtotalCents,
    inboundCents,
    returnCents,
    totalCents: subtotalCents + inboundCents + returnCents,
    declaredValueTotalCents,
    turnaroundDays,
  };
}
