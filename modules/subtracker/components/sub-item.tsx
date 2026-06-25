"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLinkIcon, Link2Icon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { deleteSubscriptionAction } from "../actions/delete-subscription.action";
import { renewSubscriptionAction } from "../actions/renew-subscription.action";
import { formatMoney } from "@/shared/utils/format-money";
import { SubEditForm } from "./sub-edit-form";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
import type { Subscription } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface SubItemProps {
  subscription: Subscription;
  dict: Dictionary;
}

export function SubItem({ subscription: sub, dict }: SubItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isRenewing, startRenew] = useTransition();
  const [renewError, setRenewError] = useState<string | null>(null);

  const cycles = dict.subscriptions.cycles;
  const categories = dict.subscriptions.categories;

  function handleDelete() {
    startDelete(async () => {
      await deleteSubscriptionAction(sub.id);
    });
  }

  const isDue = sub.next_billing_date <= new Date().toISOString().slice(0, 10);
  function handleRenew() {
    setRenewError(null);
    startRenew(async () => {
      const result = await renewSubscriptionAction(sub.id);
      if (result.error) setRenewError(result.error);
    });
  }

  return (
    <>
      <div
        className={cn(
          "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
          (isDeleting || isRenewing) && "opacity-50 pointer-events-none",
        )}
      >
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-lilac-soft">
          <span className="text-xs font-bold text-accent-lilac">
            {sub.name.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Name + category + cycle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">
              {sub.name}
            </p>
            {sub.url && (
              <a
                href={sub.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <ExternalLinkIcon size={12} />
              </a>
            )}
          </div>
          <p className="text-xs text-text-muted truncate">
            {categories[sub.category as keyof typeof categories] ?? sub.category}
            {" · "}
            {cycles[sub.billing_cycle as keyof typeof cycles] ?? sub.billing_cycle}
          </p>
        </div>

        {/* Amount + next date */}
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatMoney(Number(sub.amount))}
          </p>
          <p className="text-xs text-text-muted">
            {formatDate(sub.next_billing_date)}
          </p>
        </div>

        {isDue && <button
          type="button"
          onClick={handleRenew}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-accent-green"
          aria-label="Renew subscription"
          title="Renew subscription"
        >
          <RefreshCwIcon size={15} strokeWidth={1.75} className={isRenewing ? "animate-spin" : undefined} />
        </button>}

        {/* Open detail (linked entities) */}
        <Link
          href={`${ROUTES.subscriptions}/${sub.id}`}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label="Open subscription"
          title="Open subscription"
        >
          <Link2Icon size={15} strokeWidth={1.75} />
        </Link>

        {/* Edit button */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={dict.subscriptions.form.editButton}
        >
          <PencilIcon size={15} strokeWidth={1.75} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleDelete}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger"
          aria-label={dict.subscriptions.form.deleteButton}
        >
          <Trash2Icon size={15} strokeWidth={1.75} />
        </button>
      </div>

      {renewError && <p className="mt-2 text-xs text-danger" role="alert">{renewError}</p>}

      {/* Edit Modal */}
      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={dict.subscriptions.form.editButton}
        closeLabel={dict.common.close}
      >
        <SubEditForm
          subscription={sub}
          dict={dict}
          onSuccess={() => setIsEditing(false)}
        />
      </Modal>
    </>
  );
}
