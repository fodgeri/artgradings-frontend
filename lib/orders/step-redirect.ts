import { cardProblems } from "./card-rules";
import { shippingProblems } from "./shipping-rules";
import type { Catalog, Draft } from "./types";

/**
 * Where a later wizard step sends a draft whose cards are not ready, or null
 * when they are. A service or tier the draft names but the loaded (active)
 * catalog no longer has was withdrawn after it was chosen; the redirect says
 * so with `?problem=`, because the cards step clears the choice on load and
 * the customer would otherwise not know why.
 */
export function cardsStepRedirect(draft: Draft | null, catalog: Catalog): string | null {
  if (!draft || draft.cards.length === 0) return "/submit";
  for (const card of draft.cards) {
    if (card.service !== null && !catalog.services.some((s) => s.key === card.service)) {
      return "/submit?problem=serviceUnavailable";
    }
    if (card.tierKey !== null && !catalog.tiers.some((t) => t.key === card.tierKey)) {
      return "/submit?problem=tierUnavailable";
    }
  }
  if (draft.cards.some((card) => cardProblems(card, catalog).length > 0)) return "/submit";
  return null;
}

/** Where the summary step sends a draft it cannot show yet, or null to show it. */
export function summaryRedirect(draft: Draft | null, catalog: Catalog): string | null {
  const cards = cardsStepRedirect(draft, catalog);
  if (cards !== null || draft === null) return cards ?? "/submit";
  if (shippingProblems(draft.shipping, catalog).length > 0) return "/submit/shipping";
  return null;
}
