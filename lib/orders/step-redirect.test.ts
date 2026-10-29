import { describe, expect, test } from "vitest";

import { CATALOG, REFERENCE_DRAFT } from "./fixtures";
import { cardsStepRedirect, summaryRedirect } from "./step-redirect";
import type { Catalog, Draft } from "./types";

const without = (catalog: Catalog, part: "services" | "tiers", key: string): Catalog => ({
  ...catalog,
  [part]: catalog[part].filter((row: { key: string }) => row.key !== key),
});
const withCard = (overrides: Partial<Draft["cards"][number]>): Draft => ({
  ...REFERENCE_DRAFT,
  cards: [{ ...REFERENCE_DRAFT.cards[0], ...overrides }, REFERENCE_DRAFT.cards[1]],
});

describe("summaryRedirect", () => {
  test("a complete draft stays on the summary", () => {
    expect(summaryRedirect(REFERENCE_DRAFT, CATALOG)).toBeNull();
  });

  test("no draft, or no cards, goes back to the cards step", () => {
    expect(summaryRedirect(null, CATALOG)).toBe("/submit");
    expect(summaryRedirect({ ...REFERENCE_DRAFT, cards: [] }, CATALOG)).toBe("/submit");
  });

  test("a withdrawn service says so", () => {
    expect(summaryRedirect(REFERENCE_DRAFT, without(CATALOG, "services", "grading"))).toBe(
      "/submit?problem=serviceUnavailable",
    );
  });

  test("a withdrawn tier says so", () => {
    expect(summaryRedirect(REFERENCE_DRAFT, without(CATALOG, "tiers", "grading_standard"))).toBe(
      "/submit?problem=tierUnavailable",
    );
  });

  test("a card that is merely unfinished goes back without a problem", () => {
    expect(summaryRedirect(withCard({ brand: null }), CATALOG)).toBe("/submit");
    expect(summaryRedirect(withCard({ service: null, tierKey: null }), CATALOG)).toBe("/submit");
  });

  test("ready cards with unfinished shipping go to the shipping step", () => {
    const draft = { ...REFERENCE_DRAFT, shipping: { ...REFERENCE_DRAFT.shipping, phone: null } };
    expect(summaryRedirect(draft, CATALOG)).toBe("/submit/shipping");
    expect(cardsStepRedirect(draft, CATALOG)).toBeNull();
  });
});
