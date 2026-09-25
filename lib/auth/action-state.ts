import { hasLocale, type Locale } from "next-intl";

import { routing } from "@/i18n/routing";

import type { AuthErrorKey } from "./errors";

/**
 * What an auth action hands back to its form. `sent` is the "if an account
 * exists, we've emailed it" outcome; every other success redirects instead of
 * returning.
 *
 * Lives here rather than beside the actions because a `"use server"` module
 * may only export async functions.
 */
export type AuthFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; errorKey: AuthErrorKey };

/**
 * The shape every form action has. `locale` is bound by `AuthForm` from the
 * active locale — it comes from the browser, so validate it with
 * `resolveLocale()` before use.
 */
export type AuthAction = (
  locale: string,
  previous: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

export const initialAuthState: AuthFormState = { status: "idle" };

/** A text field's value, or "" when it is missing or not a string. */
export function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Deliberately loose — Supabase does the real validation. This only stops
 * obviously malformed input before it becomes a round trip and a Sentry event.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The trimmed `email` field, or null when it is not plausibly an address. */
export function readEmail(formData: FormData): string | null {
  const email = readField(formData, "email").trim();
  return EMAIL_SHAPE.test(email) ? email : null;
}

/** `value` if it is a supported locale, otherwise the default. */
export function resolveLocale(value: string): Locale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
