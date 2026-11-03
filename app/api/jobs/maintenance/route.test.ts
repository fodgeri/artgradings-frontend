// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const runMaintenance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobs/run-maintenance", () => ({ runMaintenance }));

import { POST } from "./route";

const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/jobs/maintenance", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  runMaintenance.mockReset();
  runMaintenance.mockResolvedValue({ expiredDrafts: 2, deletedPhotos: 5 });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/jobs/maintenance", () => {
  test("404 without JOBS_SECRET, even with a header", async () => {
    vi.stubEnv("JOBS_SECRET", "");
    expect((await call("Bearer ")).status).toBe(404);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  test("401 with a wrong or missing token, 200 with the right one", async () => {
    vi.stubEnv("JOBS_SECRET", "s3cret-token");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer s3cret-tokeX")).status).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();

    const ok = await call("Bearer s3cret-token");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ expiredDrafts: 2, deletedPhotos: 5 });
  });

  test("a token of a different length is 401, not a thrown error", async () => {
    vi.stubEnv("JOBS_SECRET", "s3cret-token");
    await expect(call("Bearer short")).resolves.toHaveProperty("status", 401);
    await expect(call(`Bearer ${"x".repeat(500)}`)).resolves.toHaveProperty("status", 401);
  });

  test("GET is not exported", async () => {
    const mod = await import("./route");
    expect("GET" in mod).toBe(false);
  });
});
