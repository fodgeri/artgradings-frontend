import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server.js plus only the
  // node_modules it actually needs. This is what the Docker runtime stage
  // copies; without it the image build fails at the COPY step.
  output: "standalone",
};

// Resolves ./i18n/request.ts by convention.
const withNextIntl = createNextIntlPlugin();

// Sentry wraps outermost: it needs to see the final config, including the
// webpack/turbopack hooks next-intl installs.
export default withSentryConfig(withNextIntl(nextConfig), {
  // Build-time identifiers, not secrets. Supplied as Docker build args in CI;
  // unset locally, where the plugin then skips upload entirely.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // A real credential, and the reason `npm run build` runs under a BuildKit
  // secret mount in the Dockerfile rather than a build arg. Absent, the build
  // still succeeds — it just uploads nothing.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Without source maps, every production stack trace is minified nonsense.
  widenClientFileUpload: true,
  sourcemaps: {
    // Upload them, then delete them from the build output. Otherwise the maps
    // ship inside the image and are served publicly next to the bundle.
    deleteSourcemapsAfterUpload: true,
  },

  // Proxies browser events through our own origin. Ad blockers block requests
  // to sentry.io by name, and without this a meaningful share of real client
  // errors never arrives. `proxy.ts` must exclude this path — it does.
  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
  telemetry: false,
});
