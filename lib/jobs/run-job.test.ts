// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const createAdminClient = vi.hoisted(() => vi.fn());
const reportJobError = vi.hoisted(() => vi.fn());
const jobs = vi.hoisted(() => ({
  maintenance: vi.fn(),
  "search-delta": vi.fn(),
  "search-rebuild": vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("./errors", () => ({ reportJobError }));
vi.mock("./registry", () => ({ JOBS: jobs }));

import { JOB_LEASE_SECONDS, runJob } from "./run-job";

const STARTED = "2026-11-19T10:00:00.123456+00:00";
const PREVIOUS = "2026-11-19T09:00:00+00:00";

function begin(acquired: boolean) {
  rpc.mockImplementation(async (name: string) =>
    name === "begin_job_run"
      ? { data: [{ acquired, started_at: STARTED, previous_success_started_at: PREVIOUS }], error: null }
      : { data: null, error: null },
  );
}
const finishCalls = () => rpc.mock.calls.filter(([n]) => n === "finish_job_run");

beforeEach(() => {
  rpc.mockReset();
  createAdminClient.mockReset();
  createAdminClient.mockReturnValue({ rpc });
  reportJobError.mockReset();
  for (const fn of Object.values(jobs)) fn.mockReset();
});

describe("runJob", () => {
  test("a held lease is busy and runs nothing", async () => {
    begin(false);
    await expect(runJob("maintenance")).resolves.toBe("busy");
    expect(jobs.maintenance).not.toHaveBeenCalled();
    expect(finishCalls()).toHaveLength(0);
    expect(rpc).toHaveBeenCalledWith("begin_job_run", {
      p_job: "maintenance",
      p_lease_seconds: JOB_LEASE_SECONDS,
    });
  });

  test("success finishes with true and the same started_at", async () => {
    begin(true);
    jobs["search-delta"].mockResolvedValue({ indexed: 2 });
    await expect(runJob("search-delta")).resolves.toBe("ran");
    const ctx = jobs["search-delta"].mock.calls[0][0];
    expect(ctx.startedAt).toEqual(new Date(STARTED));
    expect(ctx.previousSuccessStartedAt).toEqual(new Date(PREVIOUS));
    expect(finishCalls()).toEqual([
      ["finish_job_run", { p_job: "search-delta", p_started_at: STARTED, p_success: true }],
    ]);
    expect(reportJobError).not.toHaveBeenCalled();
  });

  test("a throwing job finishes with false and is reported", async () => {
    begin(true);
    jobs.maintenance.mockRejectedValue(new Error("boom"));
    await expect(runJob("maintenance")).resolves.toBe("failed");
    expect(finishCalls()).toEqual([
      ["finish_job_run", { p_job: "maintenance", p_started_at: STARTED, p_success: false }],
    ]);
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "job_failed");
  });

  test("a thrown error with a code is reported under that code, not its message", async () => {
    begin(true);
    jobs.maintenance.mockRejectedValue(Object.assign(new Error("secret row data"), { code: "rpc_failed" }));
    await expect(runJob("maintenance")).resolves.toBe("failed");
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "rpc_failed");
  });

  test("a code that fails the pattern is reported as job_failed", async () => {
    begin(true);
    jobs.maintenance.mockRejectedValue(Object.assign(new Error("x"), { code: "ECONNREFUSED" }));
    await runJob("maintenance");
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "job_failed");
  });

  test("a failing begin is reported and fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(runJob("maintenance")).resolves.toBe("failed");
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "XX000");
    expect(jobs.maintenance).not.toHaveBeenCalled();
  });

  test("a failing finish is reported and fails", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "begin_job_run"
        ? { data: [{ acquired: true, started_at: STARTED, previous_success_started_at: null }], error: null }
        : { data: null, error: { code: "XX001" } },
    );
    jobs.maintenance.mockResolvedValue({});
    await expect(runJob("maintenance")).resolves.toBe("failed");
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "XX001");
  });

  test("never rejects: an unexpected throw is reported", async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY unset");
    });
    await expect(runJob("maintenance")).resolves.toBe("failed");
    expect(reportJobError).toHaveBeenCalledWith("maintenance", "unexpected");
    expect(jobs.maintenance).not.toHaveBeenCalled();
  });
});
