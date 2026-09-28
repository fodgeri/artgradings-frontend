"use server";

import { redirect } from "@/i18n/navigation";
import { type AuthFormState, readField, resolveLocale } from "@/lib/auth/action-state";
import { reportAuthError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * The only link types our templates emit, and where each lands. Anything else
 * is refused before Supabase is called — a link we did not write is not one
 * we should act on.
 */
const DESTINATIONS = {
  email: "/account",
  recovery: "/reset-password",
  email_change: "/account/settings",
} as const;

type LinkType = keyof typeof DESTINATIONS;

function isLinkType(value: string): value is LinkType {
  // Object.hasOwn, not `in`: `toString` and `constructor` are inherited.
  return Object.hasOwn(DESTINATIONS, value);
}

/**
 * Verifies an emailed token_hash and signs the user in. Runs on the button's
 * POST, never on the link's GET, so a mail scanner that prefetches the link
 * consumes nothing.
 */
export async function confirmToken(
  locale: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const target = resolveLocale(locale);
  const linkExpired = {
    href: { pathname: "/sign-in", query: { error: "link_expired" } },
    locale: target,
  };

  const type = readField(formData, "type");
  const tokenHash = readField(formData, "token_hash");
  if (!isLinkType(type) || !tokenHash) return redirect(linkExpired);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // An expired or reused link is routine. Anything else is ours to look at.
    if (error.code !== "otp_expired") reportAuthError(error, "confirm");
    return redirect(linkExpired);
  }

  // Secure email change needs a click in BOTH inboxes. The first verifies but
  // completes nothing and signs no one in, so there is nowhere to redirect to;
  // the page says what is left. The second returns a session.
  if (type === "email_change" && !data.session) return { status: "sent" };

  return redirect({ href: DESTINATIONS[type], locale: target });
}
