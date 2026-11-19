import { after } from "next/server";

import { isJobName } from "@/lib/jobs/registry";
import { runJob } from "@/lib/jobs/run-job";
import { verifyJobRequest } from "@/lib/jobs/signature";

export const dynamic = "force-dynamic";

/**
 * Called by Supabase Cron with an HMAC signature (`private.call_job`). Absent
 * JOBS_SECRET, or for an unknown job, the route does not exist (404). The job
 * runs after the 202 so Cron's HTTP timeout never cuts it short.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[job]">) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return new Response(null, { status: 404 });

  const { job } = await ctx.params;
  if (!isJobName(job)) return new Response(null, { status: 404 });

  if (!verifyJobRequest(request.headers, job, secret, Math.floor(Date.now() / 1000))) {
    return new Response(null, { status: 401 });
  }

  after(() => runJob(job));
  return Response.json({ accepted: job }, { status: 202 });
}
