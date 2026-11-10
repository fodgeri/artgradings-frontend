import { PHOTO_INPUT_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "./limits";

/** Tried in order until the encoded photo fits under `PHOTO_MAX_BYTES`. */
const QUALITIES = [0.85, 0.7, 0.5] as const;

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

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrinks a photo in the browser: longest edge cut to `PHOTO_MAX_EDGE`,
 * re-encoded as WebP, JPEG where WebP encoding is unsupported. Quality starts
 * at 0.85 and steps down until the result fits under `PHOTO_MAX_BYTES`, the
 * limit the server enforces. Throws `"photoTooLarge"` before any decoding when
 * the input is over the cap, and after the last step when nothing fits.
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

    // A browser without WebP encoding hands back another type (PNG) instead.
    const first = await encode(canvas, "image/webp", QUALITIES[0]);
    const type = first && first.type === "image/webp" ? "image/webp" : "image/jpeg";

    for (const quality of QUALITIES) {
      const blob =
        type === "image/webp" && quality === QUALITIES[0]
          ? first
          : await encode(canvas, type, quality);
      if (!blob) throw new Error("photoUnsupported");
      if (blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    throw new Error("photoTooLarge");
  } finally {
    bitmap.close();
  }
}
