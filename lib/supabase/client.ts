import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * The client for Client Components. Sessions live in cookies, not
 * localStorage, so the server can read them too.
 */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
