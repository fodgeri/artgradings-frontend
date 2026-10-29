/**
 * The public origin of this deployment. Runtime only, set in Coolify and never
 * `NEXT_PUBLIC_`: printed QR codes point at it.
 */
export function siteUrl(): string {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("SITE_URL is not set");
  return url.replace(/\/+$/, "");
}
