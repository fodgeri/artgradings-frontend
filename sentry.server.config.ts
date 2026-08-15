import * as Sentry from "@sentry/nextjs";

/**
 * Node.js runtime Sentry init. Loaded by `instrumentation.ts` when
 * `NEXT_RUNTIME === "nodejs"` — never imported directly.
 *
 * Covers Server Components, Route Handlers and Server Actions.
 */
Sentry.init({
  // Runtime env wins so the server DSN can be rotated in Coolify without a
  // rebuild. Falls back to the build-time public DSN, which is the only one
  // set in CI and in local dev.
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Same string `/api/health` reports as `sha`, so "which release broke" and
  // "which image is live" are answered with one value.
  release: process.env.NEXT_PUBLIC_GIT_SHA,

  // There is deliberately NO `dataCollection` object here. Passing one — even
  // an empty `{}` — flips every unset category to its PERMISSIVE default and
  // starts shipping request headers, cookies, query params and bodies to
  // Sentry. Omitting it leaves `sendDefaultPii: false`, which is what an EU
  // platform handling names and shipping addresses (M3) wants by default.

  // Attaches local variable values to server stack frames. Very useful for
  // debugging, and a PII vector once M3/M7 put real customer data in scope —
  // revisit this line when order and payment code lands.
  includeLocalVariables: true,

  tracesSampler: ({ name, inheritOrSampleWith }) => {
    // Coolify polls /api/health continuously for zero-downtime deploys.
    // Sampling it would spend the trace quota on the one route that never
    // changes.
    if (name.includes("/api/health")) return 0;

    return inheritOrSampleWith(
      process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    );
  },
});
