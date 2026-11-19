import "server-only";

import type { EnqueuedTaskPromise, Meilisearch, Settings } from "meilisearch";

import type { JobContext, JobFn } from "@/lib/jobs/registry";
import { createAdminClient } from "@/lib/supabase/admin";

import { toDocument, type PopCardRow } from "./documents";
import { searchClient } from "./client";
import { POP_INDEX, POP_INDEX_SETTINGS } from "./settings";

export const DELTA_OVERLAP_MINUTES = 10;
export const SYNC_BATCH = 500;
const REBUILD_INDEX = "pop_cards_rebuild";
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
    throw new SyncError("meili_task_failed");
  }
  if (status !== "succeeded") throw new SyncError("meili_task_failed");
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error || data === null) throw new SyncError("rpc_failed");
  return data;
}

async function documentsFor(ids: string[]): Promise<ReturnType<typeof toDocument>[]> {
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
  } catch {
    return false;
  }
}

export const rebuildSearchIndex: JobFn = async () => {
  const client = requireClient();

  if (!(await indexExists(client, POP_INDEX))) {
    await settled(client.createIndex(POP_INDEX, { primaryKey: "id" }));
    await settled(client.index(POP_INDEX).updateSettings(POP_INDEX_SETTINGS as Settings));
  }
  if (await indexExists(client, REBUILD_INDEX)) {
    await settled(client.deleteIndex(REBUILD_INDEX));
  }
  await settled(client.createIndex(REBUILD_INDEX, { primaryKey: "id" }));
  const fresh = client.index(REBUILD_INDEX);
  await settled(fresh.updateSettings(POP_INDEX_SETTINGS as Settings));

  let documents = 0;
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

  await settled(client.swapIndexes([{ indexes: [POP_INDEX, REBUILD_INDEX], rename: false }]));
  await settled(client.deleteIndex(REBUILD_INDEX));
  return { documents };
};

export const runSearchDelta: JobFn = async (ctx: JobContext) => {
  if (!ctx.previousSuccessStartedAt) return rebuildSearchIndex(ctx);
  const since = new Date(
    ctx.previousSuccessStartedAt.getTime() - DELTA_OVERLAP_MINUTES * 60_000,
  );
  const ids = await rpc(
    createAdminClient().rpc("search_changed_card_ids", { p_since: since.toISOString() }),
  );
  return indexCards(ids);
};
