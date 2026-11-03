import { beforeEach, describe, expect, test, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});

import { r2Env } from "./env";
import { deleteObjects, getObject } from "./r2";

const ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
};

beforeEach(() => {
  send.mockReset();
  vi.unstubAllEnvs();
  for (const name of ["R2_ENDPOINT", "R2_REGION"]) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

describe("deleteObjects", () => {
  test("batches 2500 keys into three requests", async () => {
    send.mockResolvedValue({});
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);

    await deleteObjects(keys);

    expect(send).toHaveBeenCalledTimes(3);
    const sizes = send.mock.calls.map(
      ([cmd]) => cmd.input.Delete.Objects.length,
    );
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  test("makes no request for no keys", async () => {
    await deleteObjects([]);
    expect(send).not.toHaveBeenCalled();
  });

  test("throws when R2 reports a per-key error", async () => {
    send.mockResolvedValue({ Errors: [{ Key: "a", Code: "AccessDenied" }] });
    await expect(deleteObjects(["a"])).rejects.toThrow(/failed to delete/);
  });
});

describe("getObject", () => {
  test("returns null for NoSuchKey", async () => {
    send.mockRejectedValue(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );
    await expect(getObject("card-photos/x/y")).resolves.toBeNull();
  });

  test("rethrows other failures", async () => {
    send.mockRejectedValue(new Error("boom"));
    await expect(getObject("k")).rejects.toThrow("boom");
  });

  test("returns the stream and content type", async () => {
    const stream = new ReadableStream();
    send.mockResolvedValue({
      Body: { transformToWebStream: () => stream },
      ContentType: "image/webp",
    });
    await expect(getObject("k")).resolves.toEqual({
      body: stream,
      contentType: "image/webp",
    });
  });
});

describe("r2Env", () => {
  test.each(Object.keys(ENV))("names the missing variable %s", (name) => {
    vi.stubEnv(name, "");
    expect(() => r2Env()).toThrow(name);
  });

  test("defaults the endpoint and region to Cloudflare's", () => {
    expect(r2Env()).toMatchObject({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      forcePathStyle: false,
    });
  });

  test("a custom endpoint selects path-style and needs no account id", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ENDPOINT", "http://127.0.0.1:54321/storage/v1/s3");
    vi.stubEnv("R2_REGION", "local");
    expect(r2Env()).toMatchObject({
      endpoint: "http://127.0.0.1:54321/storage/v1/s3",
      region: "local",
      forcePathStyle: true,
    });
  });
});
