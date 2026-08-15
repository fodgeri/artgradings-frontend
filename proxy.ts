import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Negotiates the locale and redirects unprefixed paths (`/faq` -> `/en/faq`).
 * Resolution order: locale already in the path, then the `NEXT_LOCALE` cookie
 * (an explicit user choice), then the `Accept-Language` header, then
 * `defaultLocale`.
 *
 * Named `proxy.ts` — the `middleware.ts` convention was renamed in Next.js 16.
 */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, and anything with a file extension.
  //
  // `monitoring` is the Sentry `tunnelRoute` from next.config.ts. It is a
  // generated route, not a page, so locale negotiation would redirect it to
  // /en/monitoring and silently drop every browser-side error report.
  matcher: "/((?!api|monitoring|_next|_vercel|.*\\..*).*)",
};
