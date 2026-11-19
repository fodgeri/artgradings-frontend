import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { reportJobError } from "./errors";
import { JOBS, type JobName } from "./registry";

export const JOB_LEASE_SECONDS = 600;

/**
 * Runs a job under a database lease so overlapping Cron calls do nothing.
 * `finish_job_run` is always called for an acquired lease, with the exact
 * `started_at` text `begin_job_run` returned.
 */
export async function runJob(job: JobName): Promise<"ran" | "busy" | "failed"> {
  const admin = createAdminClient();

  const begun = await admin.rpc("begin_job_run", {
    p_job: job,
    p_lease_seconds: JOB_LEASE_SECONDS,
  });
  const row = begun.data?.[0];
  if (begun.error || !row) {
    reportJobError(job, begun.error?.code || "begin_failed");
    return "failed";
  }
  if (!row.acquired) return "busy";

  let success = false;
  try {
    await JOBS[job]({
      startedAt: new Date(row.started_at),
      previousSuccessStartedAt: row.previous_success_started_at
        ? new Date(row.previous_success_started_at)
        : null,
    });
    success = true;
  } catch {
    reportJobError(job, "job_failed");
  }

  const finished = await admin.rpc("finish_job_run", {
    p_job: job,
    p_started_at: row.started_at,
    p_success: success,
  });
  if (finished.error) {
    reportJobError(job, finished.error.code || "finish_failed");
    return "failed";
  }
  return success ? "ran" : "failed";
}
