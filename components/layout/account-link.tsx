"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Sign in", or "Account" once the browser holds a session.
 *
 * Renders "Sign in" on the server and switches after hydration, so the header
 * — and every public page — stays static. Reading the session on the server
 * would read cookies and make every page dynamic.
 *
 * This is a DISPLAY HINT, never an authorization decision, which is why the
 * unverified `getSession()` is acceptable here and nowhere else. `/account`
 * checks for real with `requireUser()`.
 *
 * Re-reads on every pathname change: signing in redirects client-side, this
 * component does not remount, and `onAuthStateChange` does not fire for
 * cookies a Server Action set.
 */
export function AccountLink({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(data.session !== null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session !== null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  return (
    <Link href={signedIn ? "/account" : "/sign-in"} className={className}>
      {signedIn ? t("account") : t("signIn")}
    </Link>
  );
}
