// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const intlHandler = vi.fn();
const updateSession = vi.fn();

vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) => intlHandler(request),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: (request: NextRequest) => updateSession(request),
}));

const { default: proxy } = await import("./proxy");

beforeEach(() => {
  intlHandler.mockReset();
  updateSession.mockReset();
});

const NO_STORE = {
  "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
  expires: "0",
  pragma: "no-cache",
};

/** What updateSession returns after it has actually rotated a token. */
function refreshed() {
  const response = NextResponse.next();
  response.cookies.set("sb-access-token", "rotated", { path: "/" });
  return { response, authHeaders: NO_STORE };
}

describe("proxy composition", () => {
  test("carries refreshed auth cookies onto a next-intl redirect", async () => {
    // The regression that matters. next-intl canonicalises `/en/faq` to
    // `/faq`, and a redirect response does not inherit the Set-Cookie headers
    // Supabase produced — so without the merge the rotated token is dropped on
    // exactly the requests that redirect, and sessions die intermittently.
    updateSession.mockResolvedValue(refreshed());
    intlHandler.mockReturnValue(
      NextResponse.redirect(new URL("http://localhost:3000/faq")),
    );

    const result = await proxy(
      new NextRequest("http://localhost:3000/en/faq"),
    );

    expect(result.status).toBe(307);
    expect(result.cookies.get("sb-access-token")?.value).toBe("rotated");
  });

  test("carries refreshed auth cookies onto a normal response", async () => {
    updateSession.mockResolvedValue(refreshed());
    intlHandler.mockReturnValue(NextResponse.next());

    const result = await proxy(new NextRequest("http://localhost:3000/faq"));

    expect(result.cookies.get("sb-access-token")?.value).toBe("rotated");
  });

  test("carries the no-store headers onto a redirect", async () => {
    // These accompany rotated auth cookies for a reason: without them a CDN
    // may cache a response carrying a session token and serve it to another
    // user. They live on the response updateSession built, which is not the
    // response that ships, so dropping them is silent.
    updateSession.mockResolvedValue(refreshed());
    intlHandler.mockReturnValue(
      NextResponse.redirect(new URL("http://localhost:3000/faq")),
    );

    const result = await proxy(new NextRequest("http://localhost:3000/en/faq"));

    expect(result.headers.get("cache-control")).toBe(NO_STORE["cache-control"]);
    expect(result.headers.get("pragma")).toBe("no-cache");
    // Next's internal markers must NOT be copied across — one on a redirect
    // stops the redirect working.
    expect(result.headers.get("x-middleware-next")).toBeNull();
    expect(result.status).toBe(307);
  });

  test("refreshes the session before next-intl negotiates the locale", async () => {
    // Order is load-bearing: Supabase may rewrite the request's cookies, and
    // next-intl reads NEXT_LOCALE from that same jar.
    updateSession.mockResolvedValue(refreshed());
    intlHandler.mockReturnValue(NextResponse.next());

    await proxy(new NextRequest("http://localhost:3000/faq"));

    expect(updateSession.mock.invocationCallOrder[0]).toBeLessThan(
      intlHandler.mock.invocationCallOrder[0],
    );
  });
});
