/**
 * A random v4 UUID, in the browser or on the server.
 *
 * `crypto.randomUUID` exists only in secure contexts — HTTPS or localhost — so
 * a dev server opened over a plain-HTTP LAN or Tailscale address has none.
 * `crypto.getRandomValues` has no such restriction and is just as random.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
