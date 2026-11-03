import { afterEach, describe, expect, test, vi } from "vitest";

import { randomId } from "./uuid";

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
