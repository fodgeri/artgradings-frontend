import { afterEach, describe, expect, test, vi } from "vitest";

import { siteUrl } from "./site-url";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  test("names SITE_URL when it is unset", () => {
    vi.stubEnv("SITE_URL", "");
    expect(() => siteUrl()).toThrow(/SITE_URL/);
  });

  test("strips a trailing slash", () => {
    vi.stubEnv("SITE_URL", "https://example.test/");
    expect(siteUrl()).toBe("https://example.test");
  });
});
