"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { PHOTO_TYPES } from "@/lib/photos/limits";

/**
 * A card-shaped photo zone: click, keyboard or drop a file to choose one, and
 * a preview with a remove control once there is one. It does no uploading:
 * the caller compresses and stores the file in `onSelect`. `busy` is for the
 * caller's in-flight work and locks the zone like `disabled` does. Copy comes
 * in as props.
 *
 * One photo at a time: while `previewUrl` is set the picker is hidden, so a
 * second photo means removing the first. Dropping is an addition to the file
 * input, never the only way in.
 */
export function PhotoInput({
  previewUrl,
  disabled = false,
  busy = false,
  onSelect,
  onReject,
  onRemove,
  label,
  removeLabel,
  busyLabel,
  hint,
  className,
}: {
  previewUrl?: string | null;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (file: File) => void;
  /** A dropped file that is not one of the accepted image types. */
  onReject?: () => void;
  onRemove: () => void;
  label: string;
  removeLabel: string;
  /** Shown in place of `label` while `busy`. */
  busyLabel?: string;
  /** A quiet second line in the empty zone. */
  hint?: string;
  className?: string;
}) {
  const locked = disabled || busy;
  const [dragging, setDragging] = useState(false);

  return (
    <div className={cn("flex w-[148px] max-w-full flex-col gap-2", className)} aria-busy={busy}>
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob or same-origin preview */}
          <img
            src={previewUrl}
            alt=""
            className="aspect-[5/7] w-full rounded-card border border-hairline bg-surface-sunken object-cover"
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={locked}
            className="focus-ring text-sm min-h-11 cursor-pointer rounded-control px-2 font-medium text-ink underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && busyLabel ? busyLabel : removeLabel}
          </button>
        </>
      ) : (
        <label
          onDragOver={(e) => {
            if (locked) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (locked) return;
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            if ((PHOTO_TYPES as readonly string[]).includes(file.type)) onSelect(file);
            else onReject?.();
          }}
          className={cn(
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold text-sm flex aspect-[5/7] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-gold-line bg-gold-soft p-3 text-center font-medium text-gold-ink transition-colors duration-150",
            dragging && "border-gold",
            locked && "cursor-not-allowed opacity-50",
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6">
            <path
              d="M12 16V5M8 9l4-4 4 4M5 19h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{busy && busyLabel ? busyLabel : label}</span>
          {hint && !busy ? <span className="font-normal text-muted">{hint}</span> : null}
          <input
            type="file"
            aria-label={label}
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
