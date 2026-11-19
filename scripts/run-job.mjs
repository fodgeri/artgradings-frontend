import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Same scheme as private.call_job: v1=hex(hmac_sha256(secret, "<job>.<ts>")). */
export function sign(job, ts, secret) {
  return "v1=" + createHmac("sha256", secret).update(`${job}.${ts}`).digest("hex");
}

async function main() {
  const job = process.argv[2];
  const secret = process.env.JOBS_SECRET;
  if (!job || !secret) {
    console.error("usage: JOBS_SECRET=... [JOBS_BASE_URL=...] npm run job <job>");
    process.exit(2);
  }
  const base = (process.env.JOBS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${base}/api/jobs/${encodeURIComponent(job)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-job-timestamp": String(ts),
      "x-job-signature": sign(job, ts, secret),
    },
    body: "{}",
  });
  console.log(res.status, await res.text());
  process.exit(res.status === 202 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
