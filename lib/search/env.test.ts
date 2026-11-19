import { afterEach, describe, expect, test, vi } from "vitest";
import { searchEnv } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("searchEnv", () => {
  test("is null when the host is empty", () => {
    vi.stubEnv("MEILISEARCH_HOST", "");
    vi.stubEnv("MEILISEARCH_API_KEY", "key");
    expect(searchEnv()).toBeNull();
  });

  test("is null when the key is empty", () => {
    vi.stubEnv("MEILISEARCH_HOST", "http://localhost:7700");
    vi.stubEnv("MEILISEARCH_API_KEY", "");
    expect(searchEnv()).toBeNull();
  });

  test("returns both values when set", () => {
    vi.stubEnv("MEILISEARCH_HOST", "http://localhost:7700");
    vi.stubEnv("MEILISEARCH_API_KEY", "key");
    expect(searchEnv()).toEqual({ host: "http://localhost:7700", apiKey: "key" });
  });
});
