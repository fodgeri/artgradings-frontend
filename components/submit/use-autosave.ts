"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OrderErrorKey, SaveResult } from "@/lib/orders/errors";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave of the latest value.
 *
 * - Never saves on mount: only after `value` changes from its initial value.
 * - Never runs two saves at once; changes during a save queue exactly one
 *   more save of the latest value.
 * - `flush()` saves now and resolves once nothing is in flight: `true` iff
 *   nothing is pending and the last settled save succeeded, `false` otherwise
 *   (callers must not advance on `false`).
 * - `save` may be an inline closure: the latest one is always used.
 * - A failed save leaves its value pending but is not retried by itself (no
 *   hot loop); the next change or `flush()` tries again. `errorKey` carries the save result's key (e.g. `cardGone`).
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<SaveResult<unknown>>,
  { delayMs = 800, enabled = true }: { delayMs?: number; enabled?: boolean } = {},
): {
  status: AutosaveStatus;
  errorKey: OrderErrorKey | null;
  flush: () => Promise<boolean>;
} {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [errorKey, setErrorKey] = useState<OrderErrorKey | null>(null);

  const saveRef = useRef(save);
  const latest = useRef(value);
  const dirty = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const lastSeen = useRef(value);
  const lastOk = useRef(true);

  useEffect(() => {
    saveRef.current = save;
  });

  const drain = useCallback((): Promise<void> => {
    if (running.current) return running.current;
    if (!dirty.current) return Promise.resolve();
    const run = (async () => {
      // The loop check and the clearing of `running` share a synchronous
      // step, so a change cannot slip in between them.
      for (;;) {
        if (!dirty.current) {
          running.current = null;
          return;
        }
        dirty.current = false;
        if (mounted.current) setStatus("saving");
        let result: SaveResult<unknown>;
        try {
          result = await saveRef.current(latest.current);
        } catch {
          result = { ok: false, errorKey: "generic" };
        }
        lastOk.current = result.ok;
        if (mounted.current) {
          setStatus(result.ok ? "saved" : "error");
          setErrorKey(result.ok ? null : result.errorKey);
        }
        if (!result.ok) {
          // Keep the value pending for the next flush or change, but stop
          // here: looping on a failing save would hammer the server.
          dirty.current = true;
          running.current = null;
          return;
        }
      }
    })();
    running.current = run;
    return run;
  }, []);

  useEffect(() => {
    // Compare with the last value seen rather than flagging the first run:
    // StrictMode runs effects twice on mount, and `enabled` may flip.
    if (Object.is(lastSeen.current, value)) return;
    lastSeen.current = value;
    latest.current = value;
    if (!enabled) return;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void drain();
    }, delayMs);
  }, [value, enabled, delayMs, drain]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await drain();
    return !dirty.current && lastOk.current;
  }, [drain]);

  return { status, errorKey, flush };
}
