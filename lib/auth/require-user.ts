import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email: string };

/**
 * The signed-in user, or null. Reads `getClaims()`, which verifies the JWT —
 * never `getSession()`, which trusts whatever the cookie says.
 *
 * This decides which PAGE to show. RLS remains the boundary for DATA.
 */
export async function getUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: data.claims.email ?? "" };
}

/**
 * The signed-in user, or a redirect to sign-in that brings them back to
 * `next` (a locale-less path such as "/account") afterwards.
 */
export async function requireUser({
  locale,
  next,
}: {
  locale: Locale;
  next: string;
}): Promise<AuthUser> {
  const user = await getUser();
  if (!user) {
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }
  return user;
}
