"use server";

import { cookies } from "next/headers";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { reportAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * The cookies @supabase/ssr stores a session in: `sb-<ref>-auth-token`, its
 * chunks (`.0`, `.1`, …) and the PKCE `-code-verifier`.
 */
const AUTH_COOKIE = /^sb-.+-auth-token/;

/**
 * Signs out this browser — `local`, so signing out on a phone does not end the
 * laptop's session. POST only: it is bound to a form, never a link, so a
 * prefetch or a crawler cannot sign anyone out.
 *
 * A failed sign-out still ends the session here. auth-js removes the session
 * itself when the revoke call fails, but not when loading the session fails
 * first (an expired token it cannot refresh) — and the user must never be
 * sent home believing a shared device is signed out when it is not.
 */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    reportAuthError(error, "signOut");
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll()) {
      if (AUTH_COOKIE.test(name)) cookieStore.delete(name);
    }
  }

  return redirect({ href: "/", locale: resolveLocale(locale) });
}
