// @vitest-environment node
import { describe, expect, test } from "vitest";

import { jobSignature, SIGNATURE_MAX_AGE_SECONDS, verifyJobRequest } from "./signature";

const SECRET = "test-secret";
const TS = 1700000000;
const VECTOR = "v1=ddd04777c2cff12e41d54cc8289adcc03281c52774b146301d41bd949816acfb";

function headers(ts: string, signature: string | null) {
  const h = new Headers({ "x-job-timestamp": ts });
  if (signature !== null) h.set("x-job-signature", signature);
  return h;
}

describe("jobSignature", () => {
  test("matches the vector the database computes", () => {
    expect(jobSignature("search-delta", TS, SECRET)).toBe(VECTOR);
  });
});

describe("verifyJobRequest", () => {
  const good = headers(String(TS), VECTOR);

  test("accepts a fresh signature and the edges of the window", () => {
    expect(SIGNATURE_MAX_AGE_SECONDS).toBe(300);
    expect(verifyJobRequest(good, "search-delta", SECRET, TS)).toBe(true);
    expect(verifyJobRequest(good, "search-delta", SECRET, TS + 300)).toBe(true);
    expect(verifyJobRequest(good, "search-delta", SECRET, TS - 300)).toBe(true);
  });

  test("rejects outside the window", () => {
    expect(verifyJobRequest(good, "search-delta", SECRET, TS + 301)).toBe(false);
    expect(verifyJobRequest(good, "search-delta", SECRET, TS - 301)).toBe(false);
  });

  test("rejects another job, a wrong secret and a tampered signature", () => {
    expect(verifyJobRequest(good, "maintenance", SECRET, TS)).toBe(false);
    expect(verifyJobRequest(good, "search-delta", "other", TS)).toBe(false);
    const flipped = VECTOR.slice(0, -1) + (VECTOR.endsWith("b") ? "c" : "b");
    expect(verifyJobRequest(headers(String(TS), flipped), "search-delta", SECRET, TS)).toBe(false);
  });

  test("rejects missing, malformed and wrong-length input", () => {
    expect(verifyJobRequest(headers(String(TS), null), "search-delta", SECRET, TS)).toBe(false);
    expect(verifyJobRequest(new Headers({ "x-job-signature": VECTOR }), "search-delta", SECRET, TS)).toBe(false);
    expect(verifyJobRequest(headers("1e9", VECTOR), "search-delta", SECRET, 1e9)).toBe(false);
    expect(verifyJobRequest(headers(String(TS), "v1=abcd"), "search-delta", SECRET, TS)).toBe(false);
  });
});
