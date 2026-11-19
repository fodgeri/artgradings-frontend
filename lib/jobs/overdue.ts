import "server-only";

import * as Sentry from "@sentry/nextjs";

import { createPublicClient } from "@/lib/supabase/public";

export const OVERDUE_CHECK_INTERVAL_MS = 600_000;
export const OVERDUE_RPC_TIMEOUT_MS = 1_500;

let lastCheck: number | null = null;
let lastResult: string[] = [];

/**
 * Names of scheduled jobs that have missed their window. Asks the database at
 * most once per interval (Coolify polls /api/health far more often); a failure or a
 * slow answer (1.5 s) keeps the previous answer and reports nothing.
 */
export async function checkOverdueJobs(now: number): Promise<string[]> {
  if (lastCheck !== null && now - lastCheck < OVERDUE_CHECK_INTERVAL_MS) return lastResult;
  lastCheck = now;

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), OVERDUE_RPC_TIMEOUT_MS);
    });
    const answer = await Promise.race([
      Promise.resolve(createPublicClient().rpc("overdue_jobs")),
      timeout,
    ]).finally(() => clearTimeout(timer));
    if (answer === null) return lastResult;
    const { data, error } = answer;
    if (error || !Array.isArray(data)) return lastResult;

    lastResult = data.filter((name): name is string => typeof name === "string");
    if (lastResult.length > 0) {
      Sentry.captureMessage("jobs/overdue", {
        level: "warning",
        tags: { "jobs.overdue": lastResult.join(",") },
      });
    }
  } catch {
    // Health must never fail; keep the previous result.
  }
  return lastResult;
}
