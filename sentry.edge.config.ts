import * as Sentry from "@sentry/nextjs";

/**
 * Edge runtime Sentry init. Loaded by `instrumentation.ts` when
 * `NEXT_RUNTIME === "edge"` — never imported directly.
 *
 * This is the runtime `proxy.ts` executes in, so without this file every
 * locale-negotiation failure goes unreported.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  release: process.env.NEXT_PUBLIC_GIT_SHA,

  // No `dataCollection` object — see the note in sentry.server.config.ts.

  // The proxy runs on every non-API request, so this is the highest-volume
  // runtime of the three. Uniform sampling is enough; there is no health
  // check to carve out here.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
