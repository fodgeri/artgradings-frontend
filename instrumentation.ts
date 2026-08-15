import * as Sentry from "@sentry/nextjs";

/**
 * Server-side observability registration. Next.js calls `register()` once per
 * server instance, before the first request is served.
 *
 * The two runtimes are imported lazily and conditionally on purpose: the Node
 * SDK pulls in OpenTelemetry and `node:` builtins that the Edge runtime cannot
 * load, so a static import of both would break the proxy.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Catches server-side errors Next.js handles itself before they reach any
 * global handler — Server Component renders, Route Handlers, Server Actions
 * and `proxy.ts`. Without this export those errors never reach Sentry.
 */
export const onRequestError = Sentry.captureRequestError;
