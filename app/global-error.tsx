"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * Last-resort error boundary: catches failures in the root layout itself,
 * which `app/[locale]/error.tsx` cannot reach because it renders inside that
 * layout. Next.js swallows boundary errors before any global handler sees
 * them, so the `captureException` below is the only reason Sentry hears
 * about these at all.
 *
 * i18n exception — this is the one component that cannot use
 * `messages/*.json`. It replaces the root layout, so there is no
 * `NextIntlClientProvider`, no `locale` param and no loaded messages. Rather
 * than hardcode English copy of our own, it renders Next's built-in error
 * page. See the Internationalization section of CLAUDE.md.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    // `lang` is a guess here by necessity: locale resolution lives in the
    // layout that just failed.
    <html lang="en">
      <body>
        {/* The App Router has no HTTP status code to hand us at this point,
            so 0 renders the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
