"use client";

import { AlertDialog } from "@base-ui-components/react/alert-dialog";

import { Button } from "@/components/ui/button";

/**
 * A yes/no question before something that cannot be undone. Base UI's
 * AlertDialog traps focus, closes on Escape and returns focus afterwards; it
 * does not close on an outside click, which is the point of an alert dialog.
 * Controlled: the caller owns `open`. Copy comes in as props.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-hairline bg-surface-raised p-6 shadow-card">
          <AlertDialog.Title className="m-0 font-serif text-h3 text-ink">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="m-0 mt-2 text-muted">
              {description}
            </AlertDialog.Description>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <AlertDialog.Close render={<Button type="button" variant="ghost" size="sm" />}>
              {cancelLabel}
            </AlertDialog.Close>
            <Button
              type="button"
              variant="ink"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
