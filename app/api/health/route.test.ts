// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

const checkOverdueJobs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobs/overdue", () => ({ checkOverdueJobs }));

import { GET } from "./route";

describe("GET /api/health", () => {
  test("is 200 and lists overdue jobs", async () => {
    checkOverdueJobs.mockResolvedValue(["search-delta"]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.jobs).toEqual({ overdue: ["search-delta"] });
  });

  test("is still 200 when the checker throws", async () => {
    checkOverdueJobs.mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).jobs).toEqual({ overdue: [] });
  });
});
