import type { Messages } from "next-intl";

/**
 * Compile-time completeness check for translation files.
 *
 * `i18n/request.ts` loads messages through a dynamic `import()`, which
 * TypeScript cannot check — a locale missing a key would only surface as a
 * blank string at runtime. Statically importing each file here and asserting
 * it against `Messages` (derived from `messages/en.json` in `global.d.ts`)
 * turns that into a build error instead.
 *
 * When adding a locale, add a line for it. `en` is the source of truth and
 * needs no check.
 *
 * Example, once Hungarian exists:
 *   import hu from "../messages/hu.json";
 *   const _hu: Messages = hu;
 */

// Keeps `Messages` referenced while `en` is the only locale, so this file
// stays type-checked and the import cannot be auto-pruned.
export type MessagesShape = Messages;
