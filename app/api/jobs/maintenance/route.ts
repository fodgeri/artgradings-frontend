import { timingSafeEqual } from "node:crypto";

import { runMaintenance } from "@/lib/jobs/run-maintenance";

export const dynamic = "force-dynamic";

function authorised(header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual throws on unequal lengths; a length mismatch is a plain 401.
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called hourly by a Coolify scheduled task. Absent JOBS_SECRET the route
 * does not exist (404). The Authorization header is never logged or echoed.
 */
export async function POST(request: Request) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  if (!authorised(request.headers.get("authorization"), secret)) {
    return new Response(null, { status: 401 });
  }
  return Response.json(await runMaintenance());
}
