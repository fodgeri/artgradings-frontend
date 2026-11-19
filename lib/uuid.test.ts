import { afterEach, describe, expect, test, vi } from "vitest";

import { isUuid, randomId } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("uses crypto.randomUUID where the context provides it", () => {
    expect(randomId()).toMatch(V4);
  });

  test("still returns a v4 UUID in an insecure context without randomUUID", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(array: T) => real.getRandomValues(array),
    });
    const ids = new Set(Array.from({ length: 50 }, () => randomId()));

    for (const id of ids) expect(id).toMatch(V4);
    expect(ids.size).toBe(50);
  });
});

describe("isUuid", () => {
  test("accepts a v4 UUID in either case", () => {
    const id = randomId();
    expect(isUuid(id)).toBe(true);
    expect(isUuid(id.toUpperCase())).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("../x")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("a".repeat(37))).toBe(false);
    expect(isUuid(`${randomId()}\n`)).toBe(false);
  });
});
