// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const deleteObjects = vi.hoisted(() => vi.fn());
const reportOrderError = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/storage/r2", () => ({ deleteObjects }));
vi.mock("@/lib/orders/errors", () => ({ reportOrderError }));

import { runMaintenance } from "./run-maintenance";

/** Queue of list_photo_deletions answers; once drained it answers empty. */
function setup(batches: string[][]) {
  const queue = [...batches];
  rpc.mockImplementation(async (name: string) => {
    if (name === "list_photo_deletions") return { data: queue.shift() ?? [], error: null };
    return { data: null, error: null };
  });
}

const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name);

beforeEach(() => {
  rpc.mockReset();
  deleteObjects.mockReset();
  reportOrderError.mockReset();
});

describe("runMaintenance", () => {
  test("drains until the queue is empty", async () => {
    setup([["a", "b"], ["c"]]);
    deleteObjects.mockResolvedValue(undefined);

    await expect(runMaintenance()).resolves.toEqual({ deletedPhotos: 3 });
    expect(deleteObjects).toHaveBeenNthCalledWith(1, ["a", "b"]);
    expect(deleteObjects).toHaveBeenNthCalledWith(2, ["c"]);
    expect(calls("complete_photo_deletions").map(([, a]) => a)).toEqual([
      { p_keys: ["a", "b"] },
      { p_keys: ["c"] },
    ]);
    expect(calls("list_photo_deletions")[0][1]).toEqual({ p_limit: 100 });
  });

  test("an R2 failure leaves the batch queued for the next run", async () => {
    setup([["a"], ["b"]]);
    deleteObjects.mockRejectedValue(new Error("R2 down"));

    await expect(runMaintenance()).resolves.toEqual({ deletedPhotos: 0 });
    expect(calls("complete_photo_deletions")).toHaveLength(0);
    expect(calls("list_photo_deletions")).toHaveLength(1);
    expect(reportOrderError).toHaveBeenCalledWith("maintenance", "r2_delete");
  });

  test("stops after 50 batches", async () => {
    setup(Array.from({ length: 80 }, (_, i) => [`k${i}`]));
    deleteObjects.mockResolvedValue(undefined);

    const result = await runMaintenance();
    expect(result.deletedPhotos).toBe(50);
    expect(calls("list_photo_deletions")).toHaveLength(50);
  });

  test("no longer expires drafts (pure Cron now)", async () => {
    setup([]);
    await runMaintenance();
    expect(calls("expire_stale_drafts")).toHaveLength(0);
  });
});
