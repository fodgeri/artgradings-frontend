import "server-only";

import { runMaintenance } from "./run-maintenance";

export type JobContext = { startedAt: Date; previousSuccessStartedAt: Date | null };
export type JobFn = (ctx: JobContext) => Promise<Record<string, number>>;

function notImplemented(): Promise<Record<string, number>> {
  throw new Error("not implemented");
}

export const JOBS: Record<"maintenance" | "search-delta" | "search-rebuild", JobFn> = {
  maintenance: runMaintenance,
  // Task 8 replaces these two with runSearchDelta / rebuildSearchIndex.
  "search-delta": notImplemented,
  "search-rebuild": notImplemented,
};

export type JobName = keyof typeof JOBS;

export function isJobName(v: string): v is JobName {
  return Object.hasOwn(JOBS, v);
}
