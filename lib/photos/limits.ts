/** One photo per card. */
export const MAX_PHOTOS_PER_CARD = 1;

/** The browser refuses input larger than this before resizing it. */
export const PHOTO_INPUT_MAX_BYTES = 20 * 1024 * 1024;

/** The server refuses a stored photo larger than this. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The browser cuts the longest edge to this many pixels. */
export const PHOTO_MAX_EDGE = 2000;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoType = (typeof PHOTO_TYPES)[number];
