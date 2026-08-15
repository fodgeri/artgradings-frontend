import { describe, expect, test } from "vitest";

import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

describe("routing config", () => {
  test("defaultLocale is one of the supported locales", () => {
    expect(routing.locales).toContain(routing.defaultLocale);
  });

  test("uses the as-needed prefix strategy", () => {
    // The canonical-URL guarantee in CLAUDE.md — English unprefixed, other
    // languages prefixed, one URL per page — rests entirely on this value.
    expect(routing.localePrefix).toBe("as-needed");
  });
});

describe("getPathname", () => {
  test("leaves the default locale unprefixed", () => {
    expect(getPathname({ href: "/faq", locale: routing.defaultLocale })).toBe(
      "/faq",
    );
  });

  test("can force a prefix for the default locale", () => {
    // `forcePrefix` is how a locale switcher builds an explicit URL. Asserting
    // it here exercises the prefixing machinery without inventing a locale
    // that is not in `routing.locales`.
    expect(
      getPathname({
        href: "/faq",
        locale: routing.defaultLocale,
        forcePrefix: true,
      }),
    ).toBe("/en/faq");
  });
});
