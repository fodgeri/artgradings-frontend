import { afterEach, describe, expect, test, vi } from "vitest";

import { PHOTO_INPUT_MAX_BYTES } from "./limits";
import { compressPhoto, fitWithin } from "./compress";

afterEach(() => vi.unstubAllGlobals());

describe("fitWithin", () => {
  test("keeps aspect and caps the longest edge", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  test("never enlarges", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe("compressPhoto", () => {
  test("refuses input over 20 MB before decoding", async () => {
    const spy = vi.fn();
    vi.stubGlobal("createImageBitmap", spy);
    const file = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: PHOTO_INPUT_MAX_BYTES + 1 });
    await expect(compressPhoto(file)).rejects.toThrow("photoTooLarge");
    expect(spy).not.toHaveBeenCalled();
  });

  function stubCanvas(blobs: Array<Blob | null>) {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(blobs.shift() ?? null));
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : realCreate(tag),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
    );
    return { canvas, toBlob };
  }

  test("resizes and encodes WebP at 0.85", async () => {
    const webp = new Blob(["w"], { type: "image/webp" });
    const { canvas, toBlob } = stubCanvas([webp]);
    const out = await compressPhoto(new File(["x"], "a.png", { type: "image/png" }));
    expect(out).toBe(webp);
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1500);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.85);
  });

  test("falls back to JPEG when WebP is unsupported", async () => {
    const png = new Blob(["p"], { type: "image/png" });
    const jpeg = new Blob(["j"], { type: "image/jpeg" });
    const { toBlob } = stubCanvas([png, jpeg]);
    const out = await compressPhoto(new File(["x"], "a.png", { type: "image/png" }));
    expect(out).toBe(jpeg);
    expect(toBlob).toHaveBeenLastCalledWith(expect.any(Function), "image/jpeg", 0.85);
  });
});
