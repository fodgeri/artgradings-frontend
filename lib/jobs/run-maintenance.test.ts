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

/** Queues of list_photo_deletions answers; the last repeats as empty. */
function setup(expired: number | Error, batches: string[][]) {
  const queue = [...batches];
  rpc.mockImplementation(async (name: string) => {
    if (name === "expire_stale_drafts") {
      return expired instanceof Error
        ? { data: null, error: { code: "XX000" } }
        : { data: expired, error: null };
    }
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
    setup(3, [["a", "b"], ["c"]]);
    deleteObjects.mockResolvedValue(undefined);

    await expect(runMaintenance()).resolves.toEqual({ expiredDrafts: 3, deletedPhotos: 3 });
    expect(deleteObjects).toHaveBeenNthCalledWith(1, ["a", "b"]);
    expect(deleteObjects).toHaveBeenNthCalledWith(2, ["c"]);
    expect(calls("complete_photo_deletions").map(([, a]) => a)).toEqual([
      { p_keys: ["a", "b"] },
      { p_keys: ["c"] },
    ]);
    expect(calls("list_photo_deletions")[0][1]).toEqual({ p_limit: 100 });
  });

  test("an R2 failure leaves the batch queued for the next run", async () => {
    setup(0, [["a"], ["b"]]);
    deleteObjects.mockRejectedValue(new Error("R2 down"));

    await expect(runMaintenance()).resolves.toEqual({ expiredDrafts: 0, deletedPhotos: 0 });
    expect(calls("complete_photo_deletions")).toHaveLength(0);
    expect(calls("list_photo_deletions")).toHaveLength(1);
    expect(reportOrderError).toHaveBeenCalledWith("maintenance", "r2_delete");
  });

  test("stops after 50 batches", async () => {
    setup(0, Array.from({ length: 80 }, (_, i) => [`k${i}`]));
    deleteObjects.mockResolvedValue(undefined);

    const result = await runMaintenance();
    expect(result.deletedPhotos).toBe(50);
    expect(calls("list_photo_deletions")).toHaveLength(50);
  });

  test("a failing expiry is reported and the photo drain still runs", async () => {
    setup(new Error("x"), [["a"]]);
    deleteObjects.mockResolvedValue(undefined);

    await expect(runMaintenance()).resolves.toEqual({ expiredDrafts: 0, deletedPhotos: 1 });
    expect(reportOrderError).toHaveBeenCalledWith("maintenance", "XX000");
  });
});
