import type { routing } from "./i18n/routing";
import type messages from "./messages/en.json";

/**
 * Makes `useTranslations`/`getTranslations` keys and the `Locale` type
 * check against `messages/en.json`, which is the source of truth for the
 * message shape. A typo like `t('nav.hoem')` is a compile error, and a new
 * translation file missing a key fails the build rather than rendering blank.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
