"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useMemo,
} from "react";

import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type AuthAction, initialAuthState } from "@/lib/auth/action-state";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";

/**
 * The shared shell of every auth form: pending state, the inline error, the
 * "we've emailed you" message, Turnstile, and the submit button.
 *
 * Submits through `onSubmit` + `startTransition` rather than `<form action>`.
 * React 19 resets uncontrolled fields after a form action completes, which
 * would wipe the email address every time a password is wrong. Native
 * validation (`required`, `type="email"`, `minLength`) still runs, because
 * `submit` only fires once it passes.
 *
 * Needs JavaScript — Turnstile does too. Nothing here pretends otherwise.
 */
export function AuthForm({
  action,
  submitLabel,
  sentMessage,
  captcha = true,
  children,
}: {
  action: AuthAction;
  submitLabel: string;
  sentMessage?: string;
  captcha?: boolean;
  children: ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("auth.errors");
  const boundAction = useMemo(() => action.bind(null, locale), [action, locale]);
  const [state, formAction, pending] = useActionState(boundAction, initialAuthState);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {children}

      {captcha && <Turnstile resetKey={state} />}

      {state.status === "error" && (
        <p
          role="alert"
          className="mb-[18px] rounded-control border border-hairline bg-surface-sunken px-3.5 py-3 text-sm text-ink"
        >
          {t.rich(state.errorKey, {
            min: PASSWORD_MIN_LENGTH,
            max: PASSWORD_MAX_BYTES,
            resend: (chunks) => (
              <Link
                href="/sign-up/check-email"
                className="focus-ring font-semibold text-gold-ink underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      {state.status === "sent" && sentMessage && (
        <p
          role="status"
          className="mb-[18px] rounded-control border border-gold-line bg-gold-soft px-3.5 py-3 text-sm text-ink"
        >
          {sentMessage}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
