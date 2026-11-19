/**
 * The one place Meilisearch configuration is read. Runtime only, never a build
 * arg. Unset means search is unavailable, which is not an error.
 */
export function searchEnv(): { host: string; apiKey: string } | null {
  const host = process.env.MEILISEARCH_HOST;
  const apiKey = process.env.MEILISEARCH_API_KEY;
  if (!host || !apiKey) return null;
  return { host, apiKey };
}
