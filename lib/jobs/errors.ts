import * as Sentry from "@sentry/nextjs";

/**
 * Reports a caught job failure. Carries the job name and a code only —
 * never row data.
 */
export function reportJobError(job: string, code: string): void {
  Sentry.captureException(new Error(`Job error in ${job}`), {
    tags: { "job.name": job, "job.code": code },
  });
}
