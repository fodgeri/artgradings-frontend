import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { type Locale, NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { routing } from "@/i18n/routing";
import messages from "@/messages/en.json";

export { screen, within } from "@testing-library/react";

type RenderWithIntlOptions = Omit<RenderOptions, "wrapper"> & {
  locale?: Locale;
};

/**
 * Renders a component inside `NextIntlClientProvider` with the REAL messages
 * from `messages/en.json`, never a stub.
 *
 * Real messages mean a test breaks when a key is deleted or renamed, and that
 * assertions are written against resolved output instead of copy duplicated
 * into the test file — the same rule CLAUDE.md puts on components.
 *
 * Server config from `i18n/request.ts` is unavailable here, so `locale` and
 * `messages` must be passed to the provider explicitly.
 */
export function renderWithIntl(
  ui: ReactElement,
  { locale = routing.defaultLocale, ...options }: RenderWithIntlOptions = {},
): RenderResult & { user: UserEvent } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }

  // A userEvent instance per render. Interaction tests need one, and setting
  // it up here keeps every test from repeating the boilerplate — and from
  // reaching for `fireEvent`, which skips the pointer and focus events real
  // browsers dispatch.
  return { user: userEvent.setup(), ...render(ui, { wrapper: Wrapper, ...options }) };
}
