import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Resolves the locale and loads its messages for every server request.
 * Wired up by `createNextIntlPlugin()` in `next.config.ts`, which resolves
 * this file by convention at `./i18n/request.ts`.
 *
 * Reads the locale from `next/root-params` (Next.js 16.3+) rather than from
 * `requestLocale`. `requestLocale` inspects the incoming request, which opts
 * every page out of static rendering; root params are known at build time, so
 * pages prerender.
 *
 * `locale` is set when a caller passes one explicitly, e.g.
 * `getTranslations({locale})` — needed in Server Actions and Route Handlers,
 * where root params are unavailable.
 */
export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale();

    if (hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
