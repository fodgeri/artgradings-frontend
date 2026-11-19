import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_MAX_AGE_SECONDS = 300;

/** `v1=` + hex HMAC-SHA256 over `<job>.<timestamp>` — what `private.call_job` sends. */
export function jobSignature(job: string, timestamp: number, secret: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${job}.${timestamp}`).digest("hex");
}

export function verifyJobRequest(
  headers: Headers,
  job: string,
  secret: string,
  nowSeconds: number,
): boolean {
  const rawTs = headers.get("x-job-timestamp");
  const given = headers.get("x-job-signature");
  if (!rawTs || !given || !/^\d{1,15}$/.test(rawTs)) return false;
  const ts = Number(rawTs);
  if (Math.abs(nowSeconds - ts) > SIGNATURE_MAX_AGE_SECONDS) return false;

  const a = Buffer.from(given);
  const b = Buffer.from(jobSignature(job, ts, secret));
  // timingSafeEqual throws on unequal lengths.
  return a.length === b.length && timingSafeEqual(a, b);
}
