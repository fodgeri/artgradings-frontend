import * as Sentry from "@sentry/nextjs";

/**
 * Reports a caught search failure. Carries the flow and a code only — never
 * queries, filters or document data.
 */
export function reportSearchError(
  flow: "query" | "index" | "delta" | "rebuild",
  code: string,
): void {
  Sentry.captureException(new Error(`Search error in ${flow}`), {
    tags: { "search.flow": flow, "search.code": code },
  });
}
