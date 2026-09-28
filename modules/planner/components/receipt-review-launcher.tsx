"use client";

import { useState } from "react";
import { PencilLineIcon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { ReceiptReviewDialog } from "@/modules/documents/components/receipt-review-dialog";

/**
 * Opens the receipt preview for a capture already waiting in the Review tab, so
 * a receipt closed with "Later" is corrected in the same editor it was
 * captured with — line items included.
 */
export function ReceiptReviewLauncher({
  documentId,
  t,
  locale,
}: {
  documentId: string;
  t: Dictionary["inbox"]["receipt"];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-2 self-end rounded-(--neu-radius-sm) px-3 py-1.5 text-sm font-medium text-info hover:bg-info-soft"
      >
        <PencilLineIcon size={15} aria-hidden /> {t.reviewAndEdit}
      </button>
      <ReceiptReviewDialog documentId={open ? documentId : null} onClose={() => setOpen(false)} t={t} locale={locale} />
    </>
  );
}
