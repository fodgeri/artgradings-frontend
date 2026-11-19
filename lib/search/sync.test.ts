// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const rpc = vi.hoisted(() => vi.fn());
const ok = () => Object.assign(Promise.resolve({ taskUid: 1 }), {
  waitTask: async () => ({ status: "succeeded" }),
});
const failed = () => Object.assign(Promise.resolve({ taskUid: 1 }), {
  waitTask: async () => ({ status: "failed" }),
});
const idx = vi.hoisted(() => ({
  addDocuments: vi.fn(),
  deleteDocuments: vi.fn(),
  updateSettings: vi.fn(),
}));
const client = vi.hoisted(() => ({
  index: vi.fn(),
  getIndex: vi.fn(),
  createIndex: vi.fn(),
  deleteIndex: vi.fn(),
  swapIndexes: vi.fn(),
}));
const searchClient = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("./client", () => ({ searchClient }));

import { POP_INDEX_SETTINGS } from "./settings";
import {
  indexCards,
  rebuildSearchIndex,
  runSearchDelta,
  SearchUnavailableError,
} from "./sync";

const row = (id: string) => ({
  id, name: id, card_number: "1", number_key: "1", variant: null, rarity: null,
  set_id: "s", set_name: "S", set_code: null, series: null, language: "en",
  release_year: 2000, category: "pokemon", kind: "tcg", grade_counts: {},
  authentic_count: 0, total: 1, autograph_total: 0, grades_present: [],
  latest_published_at: null,
});

const ctx = (prev: Date | null) => ({ startedAt: new Date(), previousSuccessStartedAt: prev });

beforeEach(() => {
  calls.length = 0;
  rpc.mockReset();
  for (const f of [...Object.values(idx), ...Object.values(client)]) f.mockReset();
  searchClient.mockReturnValue(client);
  client.index.mockReturnValue(idx);
  idx.addDocuments.mockImplementation(() => ok());
  idx.deleteDocuments.mockImplementation(() => ok());
  idx.updateSettings.mockImplementation(() => { calls.push("settings"); return ok(); });
  client.getIndex.mockResolvedValue({});
  client.createIndex.mockImplementation(() => ok());
  client.deleteIndex.mockImplementation((u: string) => { calls.push(`delete:${u}`); return ok(); });
  client.swapIndexes.mockImplementation(() => { calls.push("swap"); return ok(); });
});

describe("indexCards", () => {
  test("upserts returned documents and deletes the ids that are no longer public", async () => {
    rpc.mockResolvedValue({ data: [row("a")], error: null });
    await expect(indexCards(["a", "b"])).resolves.toEqual({ upserted: 1, deleted: 1 });
    expect(idx.addDocuments.mock.calls[0][0]).toEqual([expect.objectContaining({ id: "a" })]);
    expect(idx.deleteDocuments).toHaveBeenCalledWith(["b"]);
  });

  test("chunks 1200 ids into 500, 500 and 200", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await indexCards(Array.from({ length: 1200 }, (_, i) => `c${i}`));
    expect(rpc.mock.calls.map(([, a]) => a.p_card_ids.length)).toEqual([500, 500, 200]);
  });

  test("a failed Meilisearch task rejects", async () => {
    rpc.mockResolvedValue({ data: [row("a")], error: null });
    idx.addDocuments.mockImplementation(() => failed());
    await expect(indexCards(["a"])).rejects.toMatchObject({ code: "meili_task_failed" });
  });

  test("an RPC error rejects with rpc_failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    await expect(indexCards(["a"])).rejects.toMatchObject({ code: "rpc_failed" });
  });

  test("an unset client throws SearchUnavailableError", async () => {
    searchClient.mockReturnValue(null);
    await expect(indexCards(["a"])).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(indexCards(["a"])).rejects.toMatchObject({ code: "meili_unavailable" });
  });
});

describe("runSearchDelta", () => {
  test("looks back 10 minutes before the previous success", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await runSearchDelta(ctx(new Date("2026-11-19T12:00:00Z")));
    expect(rpc).toHaveBeenCalledWith("search_changed_card_ids", {
      p_since: "2026-11-19T11:50:00.000Z",
    });
  });

  test("with no previous success it rebuilds", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await runSearchDelta(ctx(null));
    expect(client.swapIndexes).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("search_changed_card_ids", expect.anything());
  });
});

describe("rebuildSearchIndex", () => {
  test("applies settings before documents, then swaps and drops the rebuild index", async () => {
    idx.addDocuments.mockImplementation(() => { calls.push("add"); return ok(); });
    rpc.mockImplementation(async (name: string) =>
      name === "search_public_card_ids"
        ? { data: rpc.mock.calls.filter(([n]) => n === name).length === 1 ? ["a"] : [], error: null }
        : { data: [row("a")], error: null },
    );
    await expect(rebuildSearchIndex(ctx(null))).resolves.toEqual({ documents: 1 });
    expect(client.index).toHaveBeenCalledWith("pop_cards_rebuild");
    expect(idx.updateSettings).toHaveBeenCalledWith(POP_INDEX_SETTINGS);
    expect(calls).toEqual(["delete:pop_cards_rebuild", "settings", "add", "swap", "delete:pop_cards_rebuild"]);
    expect(client.swapIndexes).toHaveBeenCalledWith([
      { indexes: ["pop_cards", "pop_cards_rebuild"], rename: false },
    ]);
  });
});
