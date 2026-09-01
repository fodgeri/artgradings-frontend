import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/** What a refresh produced: cookies to forward, and headers that must go with them. */
export type SessionRefresh = {
  response: NextResponse;
  /**
   * Headers @supabase/ssr requires on any response that carries auth cookies:
   * `Cache-Control: private, no-store, ...`, `Expires: 0`, `Pragma: no-cache`.
   *
   * Returned separately rather than left on `response` because the caller does
   * not ship that response — next-intl's is the one that goes out. Copying the
   * whole header set across would drag Next's internal `x-middleware-*` markers
   * onto a redirect and break it, so only these travel.
   *
   * Empty when nothing was rotated, which is the common case.
   */
  authHeaders: Record<string, string>;
};

/**
 * Rotates the Supabase auth token and returns a response carrying the cookies
 * that need to reach the browser. It decides nothing about access — Next's own
 * documentation is explicit that proxy "should not be used as a full session
 * management or authorization solution", and in this project RLS is the
 * authorization boundary.
 *
 * Nothing may run between `createServerClient` and `getClaims()`. Code
 * inserted there is the classic cause of users being logged out at random.
 *
 * `getClaims()` rather than `getUser()`: with asymmetric JWT signing keys it
 * verifies locally instead of making a network round trip on every request.
 */
export async function updateSession(
  request: NextRequest,
): Promise<SessionRefresh> {
  let supabaseResponse = NextResponse.next({ request });
  let authHeaders: Record<string, string> = {};
  const { url, publishableKey } = supabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // The no-store set. A response carrying auth cookies must not be
        // cached by a CDN or reverse proxy, or one user's session token gets
        // served to another. Kept for the caller to apply to the response it
        // actually ships.
        authHeaders = { ...(headers ?? {}) };
        for (const [key, value] of Object.entries(authHeaders)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  await supabase.auth.getClaims();

  return { response: supabaseResponse, authHeaders };
}
