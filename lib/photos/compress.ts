import { PHOTO_INPUT_MAX_BYTES, PHOTO_MAX_EDGE } from "./limits";

/** Scales to fit the longest edge within `maxEdge`, keeping aspect. Never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * Shrinks a photo in the browser: longest edge cut to `PHOTO_MAX_EDGE`,
 * re-encoded as WebP at 0.85, JPEG where WebP encoding is unsupported.
 * Throws `"photoTooLarge"` before any decoding when the input is over the cap.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (file.size > PHOTO_INPUT_MAX_BYTES) throw new Error("photoTooLarge");

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("photoUnsupported");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = await encode(canvas, "image/webp");
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await encode(canvas, "image/jpeg");
    if (!jpeg) throw new Error("photoUnsupported");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
