import { waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithIntl } from "@/test/i18n";

import { Turnstile, turnstileSiteKey } from "./turnstile";

const api = {
  render: vi.fn<(container: HTMLElement, options: Record<string, unknown>) => string>(() => "widget-1"),
  reset: vi.fn(),
  remove: vi.fn(),
};

const SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';

beforeEach(() => {
  vi.clearAllMocks();
  window.turnstile = api;
});

afterEach(() => {
  delete window.turnstile;
  vi.unstubAllEnvs();
});

function tokenInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[name="captchaToken"]');
  if (!input) throw new Error("no captchaToken input");
  return input;
}

async function renderedOptions() {
  await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
  return api.render.mock.calls[0][1] as { callback: (token: string) => void } & Record<string, unknown>;
}

describe("Turnstile", () => {
  test("renders one invisible-unless-needed widget with the site key and locale", async () => {
    renderWithIntl(<Turnstile resetKey={0} />);
    expect(await renderedOptions()).toMatchObject({
      sitekey: "1x00000000000000000000AA",
      language: "en",
      appearance: "interaction-only",
      "response-field": false,
    });
  });

  test("writes the token into the hidden captchaToken input", async () => {
    const { container } = renderWithIntl(<Turnstile resetKey={0} />);
    const options = await renderedOptions();
    act(() => options.callback("token-abc"));
    expect(tokenInput(container).value).toBe("token-abc");
  });

  test("resets the widget and clears the token when resetKey changes", async () => {
    const { container, rerender } = renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    const options = await renderedOptions();
    act(() => options.callback("token-abc"));

    rerender(<Turnstile resetKey={{ status: "error" }} />);

    expect(api.reset).toHaveBeenCalledWith("widget-1");
    expect(tokenInput(container).value).toBe("");
  });

  test("resets again for a second outcome that looks the same", async () => {
    // Resend twice: both return { status: "sent" }, but each is a new object,
    // and the second request needs a fresh single-use token.
    const { rerender } = renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    await renderedOptions();
    rerender(<Turnstile resetKey={{ status: "sent" }} />);
    rerender(<Turnstile resetKey={{ status: "sent" }} />);
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  test("does not reset on first render", async () => {
    renderWithIntl(<Turnstile resetKey={{ status: "idle" }} />);
    await renderedOptions();
    expect(api.reset).not.toHaveBeenCalled();
  });

  test("removes the widget on unmount", async () => {
    const { unmount } = renderWithIntl(<Turnstile resetKey={0} />);
    await renderedOptions();
    unmount();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });

});

describe("script loading", () => {
  // These tests exercise the real `document.createElement("script")` /
  // onload / onerror path, which every other test above bypasses by
  // pre-setting `window.turnstile`. The module-level `scriptPromise`
  // singleton persists across tests in this file, so each test here resets
  // the module registry and re-imports the component fresh rather than
  // adding a test-only export to reach into it.

  beforeEach(() => {
    delete window.turnstile;
  });

  afterEach(() => {
    // Belt and braces: a test that fails before reaching its own assertions
    // must not leave a stray <script> for the next test to trip over.
    document.querySelectorAll(SCRIPT_SELECTOR).forEach((el) => el.remove());
  });

  async function freshTurnstile() {
    vi.resetModules();
    const fresh = await import("./turnstile");
    return fresh.Turnstile;
  }

  function appendedScript(): HTMLScriptElement {
    const script = document.head.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    if (!script) throw new Error("script tag not appended yet");
    return script;
  }

  test("two concurrent mounts append exactly one script tag", async () => {
    const FreshTurnstile = await freshTurnstile();

    renderWithIntl(<FreshTurnstile resetKey={0} />);
    renderWithIntl(<FreshTurnstile resetKey={1} />);

    await waitFor(() => {
      expect(document.head.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
    });
  });

  test("renders the widget once the script's onload fires with window.turnstile defined", async () => {
    const FreshTurnstile = await freshTurnstile();
    renderWithIntl(<FreshTurnstile resetKey={0} />);

    await waitFor(() => appendedScript());
    const script = appendedScript();

    window.turnstile = api;
    act(() => {
      script.onload?.(new Event("load"));
    });

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
  });

  test("drops the failed tag on error, and a later mount retries with a fresh one", async () => {
    const FreshTurnstile = await freshTurnstile();
    const first = renderWithIntl(<FreshTurnstile resetKey={0} />);

    await waitFor(() => appendedScript());
    const failed = appendedScript();

    act(() => {
      failed.onerror?.(new Event("error"));
    });

    await waitFor(() => {
      expect(document.head.querySelector(SCRIPT_SELECTOR)).toBeNull();
    });

    first.unmount();

    // Same module instance as the failed mount (no further resetModules): a
    // fresh mount retries and appends a brand-new tag rather than reusing a
    // rejected, now-cleared `scriptPromise`.
    renderWithIntl(<FreshTurnstile resetKey={1} />);

    await waitFor(() => {
      expect(document.head.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
    });
  });
});

describe("turnstileSiteKey", () => {
  // Tested as a function rather than through a render: React 19 reports
  // uncaught render errors instead of rethrowing them, so `expect(render)
  // .toThrow()` is not a reliable way to see this.
  test("returns the configured key", () => {
    expect(turnstileSiteKey()).toBe("1x00000000000000000000AA");
  });

  test("fails loudly when the key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(() => turnstileSiteKey()).toThrow("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
  });
});
