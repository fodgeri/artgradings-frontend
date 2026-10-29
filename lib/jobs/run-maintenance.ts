import "server-only";

import { reportOrderError } from "@/lib/orders/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/storage/r2";

const BATCH_SIZE = 100;
const MAX_BATCHES = 50;

export type MaintenanceResult = { expiredDrafts: number; deletedPhotos: number };

/**
 * Hourly housekeeping: expire stale drafts, then delete the R2 objects whose
 * rows are gone. The two jobs are independent — a failure in one is reported
 * and the other still runs. An R2 failure stops the drain *without* marking
 * that batch complete, so its keys are listed again next run.
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const admin = createAdminClient();
  const result: MaintenanceResult = { expiredDrafts: 0, deletedPhotos: 0 };

  const expired = await admin.rpc("expire_stale_drafts");
  if (expired.error) reportOrderError("maintenance", expired.error.code || "unknown");
  else result.expiredDrafts = expired.data ?? 0;

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
