/**
 * The one place R2 configuration is read. Runtime only: set in Coolify, never
 * a build arg and never `NEXT_PUBLIC_`.
 *
 * Locally, `R2_ENDPOINT` points at Supabase Storage's S3 endpoint, which needs
 * path-style addressing — hence `forcePathStyle` follows `R2_ENDPOINT`.
 */
export function r2Env(): {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
} {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const customEndpoint = process.env.R2_ENDPOINT;
  const accountId = process.env.R2_ACCOUNT_ID;

  if (!customEndpoint && !accountId) throw new Error("R2_ACCOUNT_ID is not set");
  if (!accessKeyId) throw new Error("R2_ACCESS_KEY_ID is not set");
  if (!secretAccessKey) throw new Error("R2_SECRET_ACCESS_KEY is not set");
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set");

  return {
    endpoint: customEndpoint || `https://${accountId}.r2.cloudflarestorage.com`,
    region: process.env.R2_REGION || "auto",
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: Boolean(customEndpoint),
  };
}
