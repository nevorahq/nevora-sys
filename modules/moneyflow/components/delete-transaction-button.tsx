"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { deleteTransactionAction } from "../actions/delete-transaction.action";
import { useNotificationIndicator } from "@/modules/notifications/components/notification-provider";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface DeleteTransactionButtonProps {
  transactionId: string;
  transactionTitle: string;
  dict: Dictionary;
  className?: string;
}

export function DeleteTransactionButton({
  transactionId,
  transactionTitle,
  dict,
  className,
}: DeleteTransactionButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();
  const { refreshCounters } = useNotificationIndicator();
  const labels = dict.money.transactions;

  function closeConfirmation() {
    if (isDeleting) return;
    setError(null);
    setIsConfirming(false);
  }

  function handleDelete() {
    setError(null);
    startDelete(async () => {
      const result = await deleteTransactionAction(transactionId);
      if (result.error) {
        setError(result.error);
        return;
      }

      setIsConfirming(false);
      // Drop the deleted transaction's notification from the dropdown right away
      // (refreshCounters re-fetches both the badge counts and the list) and
      // refresh the server-rendered transaction list.
      refreshCounters();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsConfirming(true)}
        className={cn(
          "soft-icon-button h-8 w-8 text-text-muted hover:text-danger",
          className,
        )}
        aria-label={labels.deleteButton}
        title={labels.deleteButton}
      >
        <Trash2Icon size={15} strokeWidth={1.75} />
      </button>

      <Modal
        isOpen={isConfirming}
        onClose={closeConfirmation}
        title={labels.deleteConfirmTitle}
        closeLabel={dict.common.close}
      >
        <p className="text-sm leading-6 text-text-secondary">
          {labels.deleteConfirmDescription} “{transactionTitle}”
        </p>

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert" aria-live="polite">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeConfirmation}
            disabled={isDeleting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
          >
            {labels.deleteCancelButton}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isDeleting ? labels.deletingButton : labels.deleteButton}
          </button>
        </div>
      </Modal>
    </>
  );
}
