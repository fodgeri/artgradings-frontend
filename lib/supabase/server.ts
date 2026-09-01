import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * The client for Server Components, Server Actions and Route Handlers. Async
 * because `cookies()` is async in Next 16.
 *
 * Create it per request — never hoist it to a module-level constant, which
 * would share one user's session across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // `setAll` also receives the no-store headers a response setting auth
      // cookies must carry. They are ignored here and applied in proxy.ts
      // instead, which owns a real Response; a Server Component has no
      // response object to put them on.
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Safe to swallow: proxy.ts
          // refreshes the session on every matched request, so the rotated
          // token still reaches the browser.
        }
      },
    },
  });
}
