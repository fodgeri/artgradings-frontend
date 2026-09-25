"use server";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { reportAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out this browser — `local`, so signing out on a phone does not end the
 * laptop's session. POST only: it is bound to a form, never a link, so a
 * prefetch or a crawler cannot sign anyone out.
 */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) reportAuthError(error, "signOut");
  return redirect({ href: "/", locale: resolveLocale(locale) });
}
