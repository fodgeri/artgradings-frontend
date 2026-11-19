import "server-only";
import { Meilisearch } from "meilisearch";
import { searchEnv } from "./env";

/** The Meilisearch client, or null when search is not configured. */
export function searchClient(): Meilisearch | null {
  const env = searchEnv();
  if (!env) return null;
  return new Meilisearch({ host: env.host, apiKey: env.apiKey });
}
