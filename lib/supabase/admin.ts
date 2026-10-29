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
 * Its callers are `lib/auth/delete-current-user.ts` (account deletion needs
 * `auth.admin.deleteUser`) and `lib/payments/record-payment.ts` (only the
 * service role may execute `record_payment_success`). `admin-import-guard.test.ts`
 * keeps it that way; `lib/jobs/run-maintenance.ts` joins in Task 17.
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
