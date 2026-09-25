"use client";

import * as Sentry from "@sentry/nextjs";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page, however many widgets mount. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile loaded without defining window.turnstile"));
    };
    script.onerror = () => {
      script.remove(); // drop the dead tag or every retry appends another
      scriptPromise = null; // let the next mount try again
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * The public site key. Throws when unset, and is called during render, so a
 * build without the build arg fails at prerender instead of shipping a sign-up
 * page nobody can submit.
 */
export function turnstileSiteKey(): string {
  // Written out in full: Next inlines NEXT_PUBLIC_* by literal textual match.
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
  return siteKey;
}

/**
 * Cloudflare Turnstile, verified by Supabase Auth — never by us. The token
 * reaches the Server Action as the `captchaToken` form field, which passes it
 * to Supabase as `options.captchaToken`.
 *
 * `interaction-only`: most visitors see nothing; only suspicious traffic gets
 * a challenge. Tokens are single-use, so the widget resets whenever `resetKey`
 * changes identity — `AuthForm` passes its action state, which is a new object
 * after every submission, success included.
 *
 * Should a Content-Security-Policy be added, `challenges.cloudflare.com` must
 * be allowed in `script-src` and `frame-src`.
 */
export function Turnstile({ resetKey }: { resetKey: unknown }) {
  const siteKey = turnstileSiteKey();
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const widgetId = useRef<string | null>(null);
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    let cancelled = false;
    const setToken = (token: string) => {
      if (input.current) input.current.value = token;
    };

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current =
          turnstile.render(container.current, {
            sitekey: siteKey,
            language: locale,
            appearance: "interaction-only",
            // We own the hidden input; don't let Turnstile add a second one.
            "response-field": false,
            callback: setToken,
            "expired-callback": () => setToken(""),
            "error-callback": () => setToken(""),
          }) ?? null;
      })
      .catch((error: unknown) => {
        // Without the widget every submission fails captcha — worth knowing.
        Sentry.captureException(error);
      });

    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, locale]);

  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    if (input.current) input.current.value = "";
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  return (
    <>
      <input ref={input} type="hidden" name="captchaToken" defaultValue="" />
      <div ref={container} className="mb-[18px] empty:hidden" />
    </>
  );
}
