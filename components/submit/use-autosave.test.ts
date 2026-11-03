import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SaveResult } from "@/lib/orders/errors";

import { useAutosave } from "./use-autosave";

const ok: SaveResult<unknown> = { ok: true, data: null };

function deferred() {
  let resolve!: (value: SaveResult<unknown>) => void;
  const promise = new Promise<SaveResult<unknown>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  test("does not save on mount", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    renderHook(() => useAutosave(1, save));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
  });

  test("saves once after the debounce, with the latest value", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ v: 3 });
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ v: 4 });
    expect(save).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(4);
    expect(result.current.status).toBe("saved");
    expect(result.current.errorKey).toBeNull();
  });

  test("a change during a save queues exactly one more save", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(ok);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    rerender({ v: 3 });
    rerender({ v: 4 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(1); // never two at once

    await act(async () => first.resolve(ok));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(4);
    expect(result.current.status).toBe("saved");
  });

  test("flush saves immediately and resolves after the save", async () => {
    const d = deferred();
    const save = vi.fn().mockReturnValue(d.promise);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    let done = false;
    let flushed!: Promise<unknown>;
    act(() => {
      flushed = result.current.flush().then(() => {
        done = true;
      });
    });
    expect(save).toHaveBeenCalledWith(2);
    await act(async () => {});
    expect(done).toBe(false);
    await act(async () => {
      d.resolve(ok);
      await flushed;
    });
    expect(done).toBe(true);
    // the debounce timer was consumed by the flush
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("flush with nothing pending resolves without saving", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { result } = renderHook(() => useAutosave(1, save));
    await act(() => result.current.flush());
    expect(save).not.toHaveBeenCalled();
  });

  test("flush waits for a save in flight, then saves the queued value", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(ok);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    rerender({ v: 3 });
    let flushed!: Promise<unknown>;
    act(() => {
      flushed = result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(ok);
      await flushed;
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(3);
  });

  test("exposes the error key of a failed save", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, errorKey: "cardGone" });
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.status).toBe("error");
    expect(result.current.errorKey).toBe("cardGone");
    // a failure does not retry on its own
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("a thrown save becomes a generic error", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.errorKey).toBe("generic");
  });

  test("uses the latest save function and honours enabled", async () => {
    const a = vi.fn().mockResolvedValue(ok);
    const b = vi.fn().mockResolvedValue(ok);
    const { rerender } = renderHook(
      ({ v, save, enabled }) => useAutosave(v, save, { enabled }),
      { initialProps: { v: 1, save: a, enabled: false } },
    );
    rerender({ v: 2, save: a, enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(a).not.toHaveBeenCalled();
    rerender({ v: 3, save: a, enabled: true });
    rerender({ v: 3, save: b, enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(3);
  });

  test("clears its timer on unmount", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { rerender, unmount } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(save).not.toHaveBeenCalled();
  });

  test("StrictMode does not save on mount, and saves once after a change", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
      wrapper: StrictMode,
    });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
    rerender({ v: 2 });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2);
  });

  test("enabling with an unchanged value does not save", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { rerender } = renderHook(
      ({ enabled }) => useAutosave(1, save, { enabled }),
      { initialProps: { enabled: false } },
    );
    rerender({ enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).not.toHaveBeenCalled();
  });

  test("flush resolves true after a successful save", async () => {
    const save = vi.fn().mockResolvedValue(ok);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.flush();
    });
    expect(saved).toBe(true);
  });

  test("a failed save makes flush resolve false; the next flush retries", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, errorKey: "generic" })
      .mockResolvedValue(ok);
    const { rerender, result } = renderHook(({ v }) => useAutosave(v, save), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    let first: boolean | undefined;
    await act(async () => {
      first = await result.current.flush();
    });
    expect(first).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    // no retry on its own
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2);
    expect(second).toBe(true);
    expect(result.current.status).toBe("saved");
  });
});
