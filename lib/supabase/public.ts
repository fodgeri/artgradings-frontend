import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * An anonymous client for public reads (the Pop Report RPCs). It reads no
 * cookies, so a page using it does not depend on the visitor's session.
 */
export function createPublicClient() {
  const { url, publishableKey } = supabaseEnv();

  return createSupabaseClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
