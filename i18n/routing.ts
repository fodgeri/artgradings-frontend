import { defineRouting } from "next-intl/routing";

/**
 * Single source of truth for which languages the site speaks.
 *
 * To add a locale: add its code to `locales`, add `messages/<code>.json`, and
 * register it in `i18n/messages.d-check.ts` so missing keys fail the build.
 * Nothing else changes — routing, `<html lang>` and every `Link` follow.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",

  // English lives at the root (`/`, `/faq`); only additional languages are
  // prefixed (`/hu/faq`). `/en/faq` redirects to `/faq` so each page has one
  // canonical URL. Adding a language never changes an English URL.
  localePrefix: "as-needed",
});
