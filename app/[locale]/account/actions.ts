"use server";

import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/auth/action-state";
import { endLocalSession } from "@/lib/auth/end-local-session";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out this browser — `local`, so signing out on a phone does not end the
 * laptop's session. POST only: it is bound to a form, never a link, so a
 * prefetch or a crawler cannot sign anyone out.
 */
export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  await endLocalSession(supabase, "signOut");
  return redirect({ href: "/", locale: resolveLocale(locale) });
}
