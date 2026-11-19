import * as Sentry from "@sentry/nextjs";

/**
 * Reports a caught job failure. Carries the job name and a code only —
 * never row data.
 */
export function reportJobError(job: string, code: string): void {
  const tags = { "job.name": job, "job.code": code };
  // Meilisearch not configured (yet) is expected state, not a crash: a warning
  // each run, not an exception every fifteen minutes. The run still fails.
  if (code === "meili_unavailable") {
    Sentry.captureMessage(`Job error in ${job}`, { level: "warning", tags });
    return;
  }
  Sentry.captureException(new Error(`Job error in ${job}`), { tags });
}
