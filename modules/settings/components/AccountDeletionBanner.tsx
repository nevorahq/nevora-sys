"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cancelAccountDeletion } from "../actions/delete-account";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Dashboard-wide reminder shown while a deletion is pending during the grace
 * window. Lets the user reactivate from anywhere with one click. Rendered by the
 * dashboard layout only when a pending request exists.
 */
export function AccountDeletionBanner({ purgeAfter, t }: { purgeAfter: string; t: Dictionary["settings"]["accountBanner"] }) {
  const [dismissedByCancel, setDismissedByCancel] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (dismissedByCancel) return null;

  const date = new Date(purgeAfter).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm"
    >
      <p className="text-text-muted">
        {t.scheduledPrefix} <strong>{date}</strong>.
        {error && <span className="ml-2 text-danger">{error}</span>}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="font-medium text-danger underline-offset-2 hover:underline disabled:opacity-60"
          disabled={cancelling}
          onClick={() =>
            startCancel(async () => {
              setError(null);
              const res = await cancelAccountDeletion();
              if (res.error) setError(res.error);
              else setDismissedByCancel(true);
            })
          }
        >
          {cancelling ? t.cancelling : t.cancelDeletion}
        </button>
        <Link
          href={ROUTES.settingsProfile}
          className="text-text-muted underline-offset-2 hover:underline"
        >
          {t.manage}
        </Link>
      </div>
    </div>
  );
}
