"use client";

import { Modal } from "./modal";
import { cn } from "@/shared/utils/cn";

/**
 * ConfirmDialog — in-app replacement for `window.confirm()`.
 *
 * Stays open while the confirmed action runs (`isPending`) so a server error
 * can be shown in place; the caller closes it on success. Cancel, Escape and
 * backdrop clicks are ignored while pending.
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  pendingLabel?: string;
  isPending?: boolean;
  error?: string | null;
  tone?: "danger" | "default";
}

export function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  pendingLabel,
  isPending = false,
  error,
  tone = "danger",
}: ConfirmDialogProps) {
  function cancel() {
    if (!isPending) onCancel();
  }

  return (
    <Modal isOpen={isOpen} onClose={cancel} title={title} closeLabel={closeLabel} size="sm">
      <p className="text-sm leading-6 text-text-secondary">{description}</p>

      {error && (
        <p className="mt-4 text-sm text-danger" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60",
            tone === "danger" ? "bg-danger text-white" : "bg-text-primary text-text-inverse",
          )}
        >
          {isPending && pendingLabel ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
