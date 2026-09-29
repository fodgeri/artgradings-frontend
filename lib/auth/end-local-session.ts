import { cookies } from "next/headers";

import type { createClient } from "@/lib/supabase/server";

import { type AuthFlow, reportAuthError } from "./errors";

/**
 * The cookies @supabase/ssr stores a session in: `sb-<ref>-auth-token`, its
 * chunks (`.0`, `.1`, …) and the PKCE `-code-verifier`.
 */
const AUTH_COOKIE = /^sb-.+-auth-token/;

export type SessionClient = Pick<Awaited<ReturnType<typeof createClient>>, "auth">;

/**
 * Ends the session in THIS browser — `local`, so other devices are untouched.
 *
 * auth-js removes the session itself when the revoke call answers 401, 403 or
 * 404 — which is what a deleted user's token gets — but not when loading the
 * session fails first (an expired token it cannot refresh). In that case the
 * cookies are cleared by hand: a user must never leave believing a browser is
 * signed out when it is not.
 */
export async function endLocalSession(supabase: SessionClient, flow: AuthFlow): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (!error) return;

  reportAuthError(error, flow);
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (AUTH_COOKIE.test(name)) cookieStore.delete(name);
  }
}
