// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ rpc }) }));

const report = vi.fn();
vi.mock("./errors", () => ({ reportPopError: (...a: unknown[]) => report(...a) }));

import { loadCard, loadCertificate, loadRecentCopies, resolveCard } from "./load";

beforeEach(() => {
  rpc.mockReset();
  report.mockReset();
});

describe("loadCard", () => {
  test("maps snake_case rows and jsonb counts to a Population", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "c1", set_id: "s1", set_name: "Base", set_code: null, category: "pokemon", kind: "tcg",
          card_number: "4", name: "Charizard", variant: null, rarity: null, language: "en",
          release_year: 1999, series: null,
          grade_counts: { g10: 3, g9: 5, bogus: 9 }, authentic_count: 2, total: 10,
          autograph_counts: { g8: 1 }, autograph_total: 1,
        },
      ],
      error: null,
    });
    const card = await loadCard("c1");
    expect(rpc).toHaveBeenCalledWith("pop_card", { p_card: "c1" });
    expect(card).toMatchObject({
      id: "c1", setCode: null, variant: null, rarity: null, series: null,
      gradeCounts: { g10: 3, g9: 5 }, authenticCount: 2, total: 10,
      autographCounts: { g8: 1 }, autographTotal: 1,
    });
  });

  test("returns null when there are no rows, throws on an RPC error", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await loadCard("x")).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(loadCard("x")).rejects.toThrow();
  });
});

describe("loadCertificate", () => {
  test("maps a withdrawn certificate to status and number only", async () => {
    rpc.mockResolvedValue({
      data: [{ status: "withdrawn", cert_number: "ART-1", card_id: null, card_name: null }],
      error: null,
    });
    expect(await loadCertificate("ART-1")).toEqual({ status: "withdrawn", certNumber: "ART-1" });
  });

  test("maps a public certificate with nullable grades", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          status: "public", cert_number: "ART-2", card_id: "c", card_name: "N", card_number: "1",
          variant: null, set_id: "s", set_name: "S", category: "mtg", release_year: null,
          language: null, service: "grading", card_grade: null, autograph_grade: "g9",
          card_authentication: "genuine", autograph_authentication: null,
          published_at: "2026-01-01T00:00:00Z", card_total: 4, graded_higher: null,
        },
      ],
      error: null,
    });
    expect(await loadCertificate("ART-2")).toMatchObject({
      status: "public", cardGrade: null, autographGrade: "g9", gradedHigher: null, cardTotal: 4,
    });
  });
});

describe("resolveCard", () => {
  test("returns the id or null", async () => {
    rpc.mockResolvedValueOnce({ data: "abc", error: null });
    expect(await resolveCard("old")).toBe("abc");
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await resolveCard("old")).toBeNull();
  });
});

describe("loadRecentCopies", () => {
  test("returns [] and reports when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await loadRecentCopies(6)).toEqual([]);
    expect(report).toHaveBeenCalledWith("recentCopies", "rpc_failed");
  });
});
