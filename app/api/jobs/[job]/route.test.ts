// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const runJob = vi.hoisted(() => vi.fn());
const callbacks = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock("next/server", async () => ({
  ...(await vi.importActual<typeof import("next/server")>("next/server")),
  after: (cb: () => unknown) => void callbacks.push(cb),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/run-job", () => ({ runJob }));

import { jobSignature } from "@/lib/jobs/signature";

import * as route from "./route";

const SECRET = "test-secret";

function call(job: string, opts: { age?: number; signAs?: string } = {}) {
  const ts = Math.floor(Date.now() / 1000) - (opts.age ?? 0);
  const request = new Request(`http://localhost/api/jobs/${job}`, {
    method: "POST",
    headers: {
      "x-job-timestamp": String(ts),
      "x-job-signature": jobSignature(opts.signAs ?? job, ts, SECRET),
    },
    body: "{}",
  });
  return route.POST(request, { params: Promise.resolve({ job }) } as never);
}

beforeEach(() => {
  process.env.JOBS_SECRET = SECRET;
  runJob.mockReset();
  runJob.mockResolvedValue("ran");
  callbacks.length = 0;
});
afterEach(() => {
  delete process.env.JOBS_SECRET;
});

describe("POST /api/jobs/[job]", () => {
  test("404 without a secret", async () => {
    delete process.env.JOBS_SECRET;
    expect((await call("search-delta")).status).toBe(404);
  });

  test("404 for an unknown job even when signed", async () => {
    expect((await call("unknown")).status).toBe(404);
  });

  test("401 for a stale or foreign signature", async () => {
    expect((await call("search-delta", { age: 301 })).status).toBe(401);
    expect((await call("search-delta", { signAs: "maintenance" })).status).toBe(401);
    expect(callbacks).toHaveLength(0);
  });

  test("202 and runs the job only after the response", async () => {
    const res = await call("search-delta");
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: "search-delta" });
    expect(runJob).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();
    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runJob).toHaveBeenCalledWith("search-delta");
  });

  test("exports no GET", () => {
    expect("GET" in route).toBe(false);
  });
});
