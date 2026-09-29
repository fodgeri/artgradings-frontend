import type { Locale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import type { AuthUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export type SettingsData = {
  firstName: string | null;
  lastName: string | null;
  email: string;
};

/**
 * What the settings page shows. The address comes from Auth, not the JWT,
 * which lags an email change made on another device by up to an hour.
 *
 * Auth is consulted before the profile error: an account deleted elsewhere
 * keeps verifying claims until its access token expires, but Auth no longer
 * knows it and its profile row is gone. That is a signed-out visitor, not an
 * outage.
 */
export async function loadSettings(locale: Locale, user: AuthUser): Promise<SettingsData> {
  const supabase = await createClient();
  const [{ data: profile, error }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
    supabase.auth.getUser(),
  ]);

  if (!auth.user) {
    return redirect({ href: { pathname: "/sign-in", query: { next: "/account/settings" } }, locale });
  }
  // Every user has a profile (the provisioning trigger). Failing to read it is
  // an outage, reported by onRequestError — the message carries no user data.
  if (error || !profile) throw new Error("Could not load the profile for the settings page");

  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: auth.user.email ?? user.email,
  };
}
