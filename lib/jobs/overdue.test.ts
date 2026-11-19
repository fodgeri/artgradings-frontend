// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const captureMessage = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ rpc }) }));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

import { OVERDUE_CHECK_INTERVAL_MS, checkOverdueJobs } from "./overdue";

beforeEach(() => {
  vi.resetModules();
  rpc.mockReset();
  captureMessage.mockReset();
});

async function fresh() {
  return (await import("./overdue")).checkOverdueJobs;
}

describe("checkOverdueJobs", () => {
  test("exports a ten minute interval", () => {
    expect(OVERDUE_CHECK_INTERVAL_MS).toBe(600_000);
    expect(checkOverdueJobs).toBeTypeOf("function");
  });

  test("calls the RPC once per interval", async () => {
    const check = await fresh();
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await check(1_000_000)).toEqual([]);
    await check(1_000_000 + OVERDUE_CHECK_INTERVAL_MS - 1);
    expect(rpc).toHaveBeenCalledTimes(1);
    await check(1_000_000 + OVERDUE_CHECK_INTERVAL_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  test("reports overdue jobs once per check", async () => {
    const check = await fresh();
    rpc.mockResolvedValue({ data: ["search-delta", "maintenance"], error: null });
    expect(await check(1)).toEqual(["search-delta", "maintenance"]);
    await check(2);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("jobs/overdue", {
      level: "warning",
      tags: { "jobs.overdue": "search-delta,maintenance" },
    });
  });

  test("an RPC error returns the previous result and reports nothing", async () => {
    const check = await fresh();
    rpc.mockResolvedValueOnce({ data: ["search-delta"], error: null });
    await check(0);
    captureMessage.mockClear();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await check(OVERDUE_CHECK_INTERVAL_MS)).toEqual(["search-delta"]);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  test("a thrown client error also returns the previous result", async () => {
    const check = await fresh();
    rpc.mockRejectedValueOnce(new Error("network"));
    expect(await check(0)).toEqual([]);
  });
});
