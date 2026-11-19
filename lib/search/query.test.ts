// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
const searchClient = vi.hoisted(() => vi.fn());
const reportSearchError = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ searchClient }));
vi.mock("./errors", () => ({ reportSearchError }));

import { searchPopCards } from "./query";

beforeEach(() => {
  vi.clearAllMocks();
  searchClient.mockReturnValue({ index: () => ({ search }) });
});

describe("searchPopCards", () => {
  test("unset env is unavailable and not reported", async () => {
    searchClient.mockReturnValue(null);
    expect(await searchPopCards({ q: "", page: 1 })).toEqual({ status: "unavailable" });
    expect(reportSearchError).not.toHaveBeenCalled();
  });

  test("a thrown error is reported and unavailable", async () => {
    search.mockRejectedValue(new Error("boom"));
    expect(await searchPopCards({ q: "", page: 1 })).toEqual({ status: "unavailable" });
    expect(reportSearchError).toHaveBeenCalledWith("query", expect.any(String));
  });

  test("empty q sorts by total with filters and paging", async () => {
    search.mockResolvedValue({ hits: [{ id: 1 }], totalHits: 30, page: 2, totalPages: 2 });
    const res = await searchPopCards({ q: "", category: "mtg", page: 2 });
    expect(search).toHaveBeenCalledWith("", {
      filter: ['category = "mtg"'],
      sort: ["total:desc"],
      hitsPerPage: 24,
      page: 2,
    });
    expect(res).toEqual({ status: "ok", hits: [{ id: 1 }], total: 30, page: 2, pages: 2 });
  });

  test("a query uses relevance (no sort)", async () => {
    search.mockResolvedValue({ hits: [], totalHits: 0, page: 1, totalPages: 0 });
    await searchPopCards({ q: "char", page: 1 });
    expect(search.mock.calls[0][1].sort).toBeUndefined();
  });
});
