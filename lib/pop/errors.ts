import * as Sentry from "@sentry/nextjs";

export type PopFlow = "recentCopies";

/** Reports a caught-and-swallowed Pop Report error: flow and code only, never data. */
export function reportPopError(flow: PopFlow, code: string): void {
  Sentry.captureException(new Error(`Pop error in ${flow}`), {
    tags: { "pop.flow": flow, "pop.code": code },
  });
}
