import { act } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "@/messages/en.json";
import { renderWithIntl, screen } from "@/test/i18n";

type Listener = (event: string, session: object | null) => void;

const mocks = vi.hoisted(() => ({
  pathname: "/",
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as Listener | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: (callback: Listener) => {
        mocks.listener = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
    },
  }),
}));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  usePathname: () => mocks.pathname,
}));

const { AccountLink } = await import("./account-link");

const SESSION = { data: { session: { access_token: "t" } } };
const NO_SESSION = { data: { session: null } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/";
  mocks.listener = null;
});

describe("AccountLink", () => {
  test("says Sign in without a session", async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    renderWithIntl(<AccountLink />);
    expect(await screen.findByRole("link", { name: messages.nav.signIn })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("says Account once a session is found", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    renderWithIntl(<AccountLink />);
    expect(await screen.findByRole("link", { name: messages.nav.account })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  test("follows an auth state change", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.account });

    act(() => mocks.listener?.("SIGNED_OUT", null));

    expect(screen.getByRole("link", { name: messages.nav.signIn })).toBeInTheDocument();
  });

  test("re-reads the session after a navigation", async () => {
    // A Server Action's redirect after sign-in is a client-side navigation:
    // this component does not remount, and onAuthStateChange does not fire
    // for cookies the server set.
    mocks.getSession.mockResolvedValue(NO_SESSION);
    const { rerender } = renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.signIn });

    mocks.getSession.mockResolvedValue(SESSION);
    mocks.pathname = "/account";
    rerender(<AccountLink />);

    expect(await screen.findByRole("link", { name: messages.nav.account })).toBeInTheDocument();
  });

  test("unsubscribes on unmount", async () => {
    mocks.getSession.mockResolvedValue(NO_SESSION);
    const { unmount } = renderWithIntl(<AccountLink />);
    await screen.findByRole("link", { name: messages.nav.signIn });
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
