import { NextResponse } from "next/server";

import { checkOverdueJobs } from "@/lib/jobs/overdue";
import packageJson from "@/package.json";

/**
 * Application health check.
 *
 * Coolify polls this for zero-downtime deploys, and it is how a deploy or
 * rollback is verified: the `sha` field echoes the git SHA baked in at build
 * time, so `curl .../api/health | jq .sha` proves which bytes are live.
 *
 * Lives outside `app/[locale]/` on purpose — `proxy.ts` excludes `/api` from
 * locale negotiation, so this is reachable at a single canonical URL with no
 * locale prefix.
 *
 * Always 200, even with overdue jobs: Coolify restarts unhealthy containers,
 * and a stale search job must not take the site down. Overdue jobs are
 * reported in the body and as a Sentry warning instead.
 *
 * No `export const dynamic` needed: GET Route Handlers have been dynamic by
 * default since Next 15 (see next docs, route.md version history).
 */
export async function GET() {
  let overdue: string[] = [];
  try {
    overdue = await checkOverdueJobs(Date.now());
  } catch {
    // Never fail the health check over the job check.
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    sha: process.env.NEXT_PUBLIC_GIT_SHA ?? "unknown",
    version: packageJson.version,
    jobs: { overdue },
  });
}
