import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { supabaseSecret } from "./env";

/**
 * The service_role client. It **bypasses every RLS policy** — it is not
 * "the server client with more access", it is the absence of the security
 * boundary this project relies on.
 *
 * `import "server-only"` above makes importing this from a Client Component a
 * build error rather than a runtime credential leak.
 *
 * Nothing uses it yet. It exists now, with its guardrail, so that it is not
 * written for the first time under deadline pressure during the M7 webhook
 * work — which is exactly when a service_role client gets reached for, and
 * exactly when a mistake is most expensive.
 */
export function createAdminClient() {
  const { url, secretKey } = supabaseSecret();

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      // There is no user and no session to persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
