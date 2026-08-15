import * as Sentry from "@sentry/nextjs";

/**
 * Browser Sentry init. Next.js loads this file into the client bundle
 * automatically — it is not imported from anywhere.
 *
 * Only `NEXT_PUBLIC_*` values are readable here; anything else is `undefined`
 * in the browser.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  release: process.env.NEXT_PUBLIC_GIT_SHA,

  // No `dataCollection` object — see the note in sentry.server.config.ts.

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});

/**
 * Ties App Router client navigations into the trace, so a slow route
 * transition shows up as a span instead of vanishing between page loads.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
