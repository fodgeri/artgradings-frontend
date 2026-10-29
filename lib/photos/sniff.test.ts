import { describe, expect, test } from "vitest";

import { sniffImageType } from "./sniff";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([
  ...ascii("RIFF"),
  0x24, 0, 0, 0,
  ...ascii("WEBP"),
  ...ascii("VP8 "),
]);

describe("sniffImageType", () => {
  test("recognises jpeg, png and webp by their magic bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  test("a png renamed .jpg is still png; a text file is null", () => {
    // The name never reaches the function: only bytes decide.
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array(ascii("hello, not an image")))).toBeNull();
  });

  test("truncated and other RIFF files are null", () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    const wav = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]);
    expect(sniffImageType(wav)).toBeNull();
  });
});
