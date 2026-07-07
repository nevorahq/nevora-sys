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
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
import type { Subscription } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export interface SubPaymentIndicator {
  status: string;
  due_date: string;
}

interface SubItemProps {
  subscription: Subscription;
  dict: Dictionary;
  cycle?: SubPaymentIndicator;
}

const PAYMENT_BADGE_STYLE: Record<string, string> = {
  planned: "bg-surface-sunken text-text-muted",
  task_open: "bg-info-soft text-info",
};

export function SubItem({ subscription: sub, dict, cycle }: SubItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isRenewing, startRenew] = useTransition();
  const [renewError, setRenewError] = useState<string | null>(null);
  const { blocked, message } = useAccessGate("write");

  const cycles = dict.subscriptions.cycles;
  const categories = dict.subscriptions.categories;

  function handleDelete() {
    if (blocked) return;
    startDelete(async () => {
      await deleteSubscriptionAction(sub.id);
    });
  }

  const isDue = sub.next_billing_date <= new Date().toISOString().slice(0, 10);
  function handleRenew() {
    if (blocked) return;
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
          {cycle && (
            <span
              className={cn(
                "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                cycle.due_date <= new Date().toISOString().slice(0, 10)
                  ? "bg-accent-yellow-soft text-accent-yellow"
                  : PAYMENT_BADGE_STYLE[cycle.status] ?? "bg-surface-sunken text-text-muted",
              )}
            >
              {cycle.due_date <= new Date().toISOString().slice(0, 10)
                ? "Payment due"
                : cycle.status === "task_open"
                  ? "Task open"
                  : "Planned"}
            </span>
          )}
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

        {/* Legacy quick-renew only for subs without a managed payment cycle;
            workflow-managed subs advance via Mark as paid / Skip to avoid a
            double next_billing_date advance. */}
        {isDue && !cycle && (
          <RestrictedActionTooltip message={blocked ? message : "Renew subscription"}>
            <button
              type="button"
              onClick={handleRenew}
              disabled={blocked}
              className="soft-icon-button h-8 w-8 text-text-muted hover:text-accent-green disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={blocked ? `Renew subscription. ${message}` : "Renew subscription"}
              title={blocked ? message : "Renew subscription"}
            >
              <RefreshCwIcon size={15} strokeWidth={1.75} className={isRenewing ? "animate-spin" : undefined} />
            </button>
          </RestrictedActionTooltip>
        )}

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
        <RestrictedActionTooltip message={blocked ? message : dict.subscriptions.form.editButton}>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            disabled={blocked}
            className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={blocked ? `${dict.subscriptions.form.editButton}. ${message}` : dict.subscriptions.form.editButton}
          >
            <PencilIcon size={15} strokeWidth={1.75} />
          </button>
        </RestrictedActionTooltip>

        {/* Delete button */}
        <RestrictedActionTooltip message={blocked ? message : dict.subscriptions.form.deleteButton}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={blocked}
            className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={blocked ? `${dict.subscriptions.form.deleteButton}. ${message}` : dict.subscriptions.form.deleteButton}
          >
            <Trash2Icon size={15} strokeWidth={1.75} />
          </button>
        </RestrictedActionTooltip>
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
