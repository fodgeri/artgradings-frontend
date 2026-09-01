import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

/**
 * Refreshes the Supabase session, then negotiates the locale, then makes sure
 * the refreshed auth cookies survive onto whichever response actually ships.
 *
 * Order is load-bearing in both directions. Supabase runs first because it may
 * rewrite the request's cookies, and next-intl reads `NEXT_LOCALE` from that
 * same jar. next-intl produces the returned response because it owns the
 * redirects (`/en/faq` -> `/faq`). And the copy in step three is not optional:
 * a redirect response does not inherit the Set-Cookie headers Supabase set, so
 * without it the rotated token is dropped on exactly the requests that
 * redirect — which is why the resulting logouts are intermittent rather than
 * total.
 *
 * The same applies to the no-store headers that must accompany rotated auth
 * cookies: without them a CDN may cache a response carrying a session token and
 * serve it to somebody else. Only those headers are copied — copying the whole
 * set would drag Next's internal `x-middleware-*` markers onto a redirect.
 *
 * Locale negotiation itself is unchanged: locale already in the path, then the
 * `NEXT_LOCALE` cookie, then `Accept-Language`, then `defaultLocale`.
 *
 * Named `proxy.ts` — the `middleware.ts` convention was renamed in Next.js 16.
 */
export default async function proxy(request: NextRequest) {
  const { response: supabaseResponse, authHeaders } =
    await updateSession(request);
  const intlResponse = handleI18nRouting(request);

  for (const cookie of supabaseResponse.cookies.getAll()) {
    intlResponse.cookies.set(cookie);
  }
  for (const [name, value] of Object.entries(authHeaders)) {
    intlResponse.headers.set(name, value);
  }

  return intlResponse;
}

export const config = {
  // Skip API routes, Next internals, and anything with a file extension.
  //
  // `monitoring` is the Sentry `tunnelRoute` from next.config.ts. It is a
  // generated route, not a page, so locale negotiation would redirect it to
  // /en/monitoring and silently drop every browser-side error report.
  matcher: "/((?!api|monitoring|_next|_vercel|.*\\..*).*)",
};
