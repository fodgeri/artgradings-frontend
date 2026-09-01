// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

import { supabaseEnv, supabaseSecret } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("supabaseEnv", () => {
  test("returns the configured url and publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local");

    expect(supabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_local",
    });
  });

  test("throws a named error when the url is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local");

    // Failing here, at construction, is the point: the alternative is a client
    // that builds fine and fails opaquely at its first request.
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test("throws a named error when the publishable key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("supabaseSecret", () => {
  test("throws when the secret key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    expect(() => supabaseSecret()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
