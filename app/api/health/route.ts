import { NextResponse } from "next/server";

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
 * No `export const dynamic` needed: GET Route Handlers have been dynamic by
 * default since Next 15 (see next docs, route.md version history).
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    sha: process.env.NEXT_PUBLIC_GIT_SHA ?? "unknown",
    version: packageJson.version,
  });
}
