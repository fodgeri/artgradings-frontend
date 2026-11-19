import "server-only";

import { reportOrderError } from "@/lib/orders/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/storage/r2";

const BATCH_SIZE = 100;
const MAX_BATCHES = 50;

export type MaintenanceResult = { deletedPhotos: number };

/**
 * Housekeeping: delete the R2 objects whose rows are gone. (Expiring stale
 * drafts is a pure-SQL Cron job.) An R2 failure stops the drain *without*
 * marking that batch complete, so its keys are listed again next run.
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const admin = createAdminClient();
  const result: MaintenanceResult = { deletedPhotos: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const listed = await admin.rpc("list_photo_deletions", { p_limit: BATCH_SIZE });
    if (listed.error) {
      reportOrderError("maintenance", listed.error.code || "unknown");
      break;
    }
    const keys = listed.data ?? [];
    if (keys.length === 0) break;

    try {
      await deleteObjects(keys);
    } catch {
      reportOrderError("maintenance", "r2_delete");
      break;
    }

    const done = await admin.rpc("complete_photo_deletions", { p_keys: keys });
    if (done.error) {
      // The objects are gone; listing them again is harmless (deletes are idempotent).
      reportOrderError("maintenance", done.error.code || "unknown");
      break;
    }
    result.deletedPhotos += keys.length;
  }

  return result;
}
