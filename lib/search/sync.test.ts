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
  getIndexes: vi.fn(),
}));
const searchClient = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("./client", () => ({ searchClient }));

import { MeilisearchApiError } from "meilisearch";

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

const STARTED = new Date("2026-11-19T12:00:00Z");
const TEMP = `pop_cards_rebuild_${STARTED.getTime()}`;
const ctx = (prev: Date | null) => ({ startedAt: STARTED, previousSuccessStartedAt: prev });
const notFound = () =>
  new MeilisearchApiError(new Response(null, { status: 404 }), {
    message: "x", code: "index_not_found", type: "invalid_request", link: "",
  });

beforeEach(() => {
  calls.length = 0;
  rpc.mockReset();
  for (const f of [...Object.values(idx), ...Object.values(client)]) f.mockReset();
  searchClient.mockReturnValue(client);
  client.index.mockReturnValue(idx);
  idx.addDocuments.mockImplementation(() => ok());
  idx.deleteDocuments.mockImplementation(() => ok());
  idx.updateSettings.mockImplementation(() => { calls.push("settings"); return ok(); });
  client.getIndex.mockImplementation(async (u: string) => {
    if (u.startsWith("pop_cards_rebuild_")) throw notFound();
    return {};
  });
  client.createIndex.mockImplementation(() => ok());
  client.deleteIndex.mockImplementation((u: string) => { calls.push(`delete:${u}`); return ok(); });
  client.getIndexes.mockResolvedValue({ results: [] });
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
    expect(rpc).toHaveBeenCalledWith("search_public_card_ids", expect.anything());
  });
});

describe("rebuildSearchIndex", () => {
  function publicIds() {
    idx.addDocuments.mockImplementation(() => { calls.push("add"); return ok(); });
    rpc.mockImplementation(async (name: string) => {
      if (name === "search_public_card_ids")
        return { data: rpc.mock.calls.filter(([n]) => n === name).length === 1 ? ["a"] : [], error: null };
      if (name === "search_changed_card_ids") return { data: [], error: null };
      return { data: [row("a")], error: null };
    });
  }

  test("builds in a temp index named for the run, settings first, then swaps and drops it", async () => {
    publicIds();
    await expect(rebuildSearchIndex(ctx(null))).resolves.toEqual({ documents: 1 });
    expect(client.index).toHaveBeenCalledWith(TEMP);
    expect(idx.updateSettings).toHaveBeenCalledWith(POP_INDEX_SETTINGS);
    expect(calls).toEqual(["settings", "add", "swap", `delete:${TEMP}`]);
    expect(client.swapIndexes).toHaveBeenCalledWith([
      { indexes: ["pop_cards", TEMP], rename: false },
    ]);
  });

  test("catches up changes made during the build, from start minus 10 minutes", async () => {
    publicIds();
    await rebuildSearchIndex(ctx(null));
    expect(rpc).toHaveBeenCalledWith("search_changed_card_ids", {
      p_since: "2026-11-19T11:50:00.000Z",
    });
  });

  test("deletes stale temp indexes but keeps a live run's", async () => {
    publicIds();
    const old = `pop_cards_rebuild_${STARTED.getTime() - 601_000}`;
    const live = `pop_cards_rebuild_${STARTED.getTime() - 5_000}`;
    client.getIndexes.mockResolvedValue({
      results: [{ uid: "pop_cards" }, { uid: "pop_cards_rebuild_1" }, { uid: old }, { uid: live }],
    });
    await rebuildSearchIndex(ctx(null));
    const deleted = client.deleteIndex.mock.calls.map(([u]) => u);
    expect(deleted).toContain("pop_cards_rebuild_1");
    expect(deleted).toContain(old);
    expect(deleted).not.toContain(live);
  });

  test("creates a missing pop_cards with settings", async () => {
    publicIds();
    client.getIndex.mockRejectedValue(notFound());
    await rebuildSearchIndex(ctx(null));
    expect(client.createIndex).toHaveBeenCalledWith("pop_cards", { primaryKey: "id" });
    expect(client.index).toHaveBeenCalledWith("pop_cards");
  });

  test("a probe that fails for another reason is meili_unavailable", async () => {
    client.getIndex.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(rebuildSearchIndex(ctx(null))).rejects.toMatchObject({ code: "meili_unavailable" });
  });

  test("a failing swap is meili_task_failed", async () => {
    publicIds();
    client.swapIndexes.mockImplementation(() => failed());
    await expect(rebuildSearchIndex(ctx(null))).rejects.toMatchObject({ code: "meili_task_failed" });
  });
});

describe("runSearchDelta with a missing index", () => {
  test("rebuilds instead of creating a bare index", async () => {
    client.getIndex.mockImplementation(async (u: string) => {
      if (u === "pop_cards" && client.swapIndexes.mock.calls.length === 0) throw notFound();
      return {};
    });
    rpc.mockResolvedValue({ data: [], error: null });
    await runSearchDelta(ctx(new Date("2026-11-19T11:00:00Z")));
    expect(client.swapIndexes).toHaveBeenCalled();
  });
});
