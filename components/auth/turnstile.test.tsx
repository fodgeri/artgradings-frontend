import { waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithIntl } from "@/test/i18n";

import { Turnstile, turnstileSiteKey } from "./turnstile";

const api = {
  render: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => "widget-1"),
  reset: vi.fn(),
  remove: vi.fn(),
};

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
