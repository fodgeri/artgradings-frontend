/**
 * The one place Supabase configuration is read.
 *
 * Each `process.env.NEXT_PUBLIC_*` is written out in full rather than looked
 * up through a variable: Next inlines these at build time by literal textual
 * match, and a dynamic lookup silently yields `undefined` in the browser
 * bundle.
 */
export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  }

  return { url, publishableKey };
}

/**
 * Server-only. `SUPABASE_SECRET_KEY` bypasses RLS, is set in Coolify at
 * runtime, and must never be a Docker build arg — a build arg is baked into
 * image layers readable by anyone who can pull the image.
 */
export function supabaseSecret(): { url: string; secretKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");

  return { url, secretKey };
}
