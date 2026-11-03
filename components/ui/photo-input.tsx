"use client";

import { cn } from "@/lib/cn";
import { PHOTO_TYPES } from "@/lib/photos/limits";

/**
 * A styled file picker with a preview and a remove control. It does no
 * uploading: the caller compresses and stores the file in `onSelect`.
 * `busy` is for the caller's in-flight work and locks the control like
 * `disabled` does. Copy comes in as props (`label`, `removeLabel`).
 *
 * One photo at a time: while `previewUrl` is set the picker is hidden, so a
 * second photo means removing the first.
 */
export function PhotoInput({
  previewUrl,
  disabled = false,
  busy = false,
  onSelect,
  onRemove,
  label,
  removeLabel,
  className,
}: {
  previewUrl?: string | null;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
  label: string;
  removeLabel: string;
  className?: string;
}) {
  const locked = disabled || busy;

  return (
    <div className={cn("flex items-center gap-4", className)} aria-busy={busy}>
      {previewUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob or same-origin preview */}
          <img
            src={previewUrl}
            alt=""
            className="size-16 rounded-card border border-hairline object-cover"
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={locked}
            className="focus-ring text-sm cursor-pointer rounded-full px-3 py-2 font-medium text-ink underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removeLabel}
          </button>
        </div>
      ) : null}
      {previewUrl ? null : (
        <label
          className={cn(
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold text-sm inline-flex min-h-11 cursor-pointer items-center rounded-full border border-hairline bg-surface px-4 font-medium text-ink",
            locked && "cursor-not-allowed opacity-50",
          )}
        >
          {label}
          <input
            type="file"
            accept={PHOTO_TYPES.join(",")}
            disabled={locked}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so choosing the same file again still fires onChange.
              e.target.value = "";
              if (file) onSelect(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
