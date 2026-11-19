import "server-only";

import { rebuildSearchIndex, runSearchDelta } from "@/lib/search/sync";

import { runMaintenance } from "./run-maintenance";

export type JobContext = { startedAt: Date; previousSuccessStartedAt: Date | null };
export type JobFn = (ctx: JobContext) => Promise<Record<string, number>>;

export const JOBS: Record<"maintenance" | "search-delta" | "search-rebuild", JobFn> = {
  maintenance: runMaintenance,
  "search-delta": runSearchDelta,
  "search-rebuild": rebuildSearchIndex,
};

export type JobName = keyof typeof JOBS;

export function isJobName(v: string): v is JobName {
  return Object.hasOwn(JOBS, v);
}
