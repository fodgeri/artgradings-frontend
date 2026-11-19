import "server-only";

import { MeilisearchApiError, type EnqueuedTaskPromise, type Meilisearch } from "meilisearch";

import { JOB_LEASE_SECONDS } from "@/lib/jobs/lease";
import type { JobContext, JobFn } from "@/lib/jobs/registry";
import { createAdminClient } from "@/lib/supabase/admin";

import { toDocument, type PopCardDocument, type PopCardRow } from "./documents";
import { searchClient } from "./client";
import { POP_INDEX, POP_INDEX_SETTINGS } from "./settings";

export const DELTA_OVERLAP_MINUTES = 10;
export const SYNC_BATCH = 500;
const TEMP_PREFIX = "pop_cards_rebuild_";
const TASK_TIMEOUT_MS = 60_000;

/** A failure with a stable code; `runJob` reports the code, never the message. */
export class SyncError extends Error {
  constructor(readonly code: "meili_unavailable" | "meili_task_failed" | "rpc_failed") {
    super(code);
    this.name = "SyncError";
  }
}

export class SearchUnavailableError extends SyncError {
  constructor() {
    super("meili_unavailable");
    this.name = "SearchUnavailableError";
  }
}

function requireClient(): Meilisearch {
  const client = searchClient();
  if (!client) throw new SearchUnavailableError();
  return client;
}

/** Waits for a Meilisearch task; a request that throws or a failed task is one error. */
async function settled(task: EnqueuedTaskPromise): Promise<void> {
  let status: string;
  try {
    status = (await task.waitTask({ timeout: TASK_TIMEOUT_MS })).status;
  } catch {
    throw new SyncError("meili_unavailable");
  }
  if (status !== "succeeded") throw new SyncError("meili_task_failed");
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error || data === null) throw new SyncError("rpc_failed");
  return data;
}

async function documentsFor(ids: string[]): Promise<PopCardDocument[]> {
  const rows = await rpc(
    createAdminClient().rpc("search_card_documents", { p_card_ids: ids }),
  );
  return (rows as PopCardRow[]).map(toDocument);
}

/** Write-through for M5, and the body of the delta. */
export async function indexCards(
  cardIds: string[],
): Promise<{ upserted: number; deleted: number }> {
  const client = requireClient();
  const index = client.index(POP_INDEX);
  let upserted = 0;
  let deleted = 0;

  for (let i = 0; i < cardIds.length; i += SYNC_BATCH) {
    const chunk = cardIds.slice(i, i + SYNC_BATCH);
    const docs = await documentsFor(chunk);
    const present = new Set(docs.map((d) => d.id));
    const gone = chunk.filter((id) => !present.has(id));

    if (docs.length > 0) {
      await settled(index.addDocuments(docs, { primaryKey: "id" }));
      upserted += docs.length;
    }
    if (gone.length > 0) {
      await settled(index.deleteDocuments(gone));
      deleted += gone.length;
    }
  }
  return { upserted, deleted };
}

async function indexExists(client: Meilisearch, uid: string): Promise<boolean> {
  try {
    await client.getIndex(uid);
    return true;
  } catch (err) {
    if (err instanceof MeilisearchApiError && err.cause?.code === "index_not_found") return false;
    throw new SyncError("meili_unavailable");
  }
}

/** Temp indexes of crashed runs; a live run's (younger than the lease) is never touched. */
async function dropStaleTemps(client: Meilisearch, now: number): Promise<void> {
  let uids: string[];
  try {
    uids = (await client.getIndexes({ limit: 1000 })).results.map((i) => i.uid);
  } catch {
    throw new SyncError("meili_unavailable");
  }
  for (const uid of uids) {
    if (!uid.startsWith(TEMP_PREFIX)) continue;
    const n = Number(uid.slice(TEMP_PREFIX.length));
    if (!Number.isInteger(n) || now - n <= JOB_LEASE_SECONDS * 1000) continue;
    await settled(client.deleteIndex(uid));
  }
}

export const rebuildSearchIndex: JobFn = async (ctx?: JobContext) => {
  const client = requireClient();
  const start = ctx?.startedAt ?? new Date();
  const temp = `${TEMP_PREFIX}${start.getTime()}`;

  if (!(await indexExists(client, POP_INDEX))) {
    await settled(client.createIndex(POP_INDEX, { primaryKey: "id" }));
    await settled(client.index(POP_INDEX).updateSettings(POP_INDEX_SETTINGS));
  }
  await dropStaleTemps(client, start.getTime());
  if (await indexExists(client, temp)) await settled(client.deleteIndex(temp));
  await settled(client.createIndex(temp, { primaryKey: "id" }));
  const fresh = client.index(temp);
  await settled(fresh.updateSettings(POP_INDEX_SETTINGS));

  let documents = 0;
  // null on the first page is intentional: the RPC coalesces it to "from the start".
  let after: string | null = null;
  for (;;) {
    const ids: string[] = await rpc(
      createAdminClient().rpc("search_public_card_ids", {
        p_after: after as string,
        p_limit: SYNC_BATCH,
      }),
    );
    if (ids.length === 0) break;
    const docs = await documentsFor(ids);
    if (docs.length > 0) {
      await settled(fresh.addDocuments(docs, { primaryKey: "id" }));
      documents += docs.length;
    }
    after = ids[ids.length - 1];
    if (ids.length < SYNC_BATCH) break;
  }

  await settled(client.swapIndexes([{ indexes: [POP_INDEX, temp], rename: false }]));
  await settled(client.deleteIndex(temp));

  // Writes that landed on the old index while we built are gone with the swap.
  await reindexSince(new Date(start.getTime() - DELTA_OVERLAP_MINUTES * 60_000));
  return { documents };
};

async function reindexSince(since: Date) {
  const ids = await rpc(
    createAdminClient().rpc("search_changed_card_ids", { p_since: since.toISOString() }),
  );
  return indexCards(ids);
}

export const runSearchDelta: JobFn = async (ctx: JobContext) => {
  if (!ctx.previousSuccessStartedAt) return rebuildSearchIndex(ctx);
  if (!(await indexExists(requireClient(), POP_INDEX))) return rebuildSearchIndex(ctx);
  return reindexSince(
    new Date(ctx.previousSuccessStartedAt.getTime() - DELTA_OVERLAP_MINUTES * 60_000),
  );
};
