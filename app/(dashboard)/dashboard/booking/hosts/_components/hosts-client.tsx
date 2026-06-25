"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AddHostForm } from "@/modules/booking/hosts/components/add-host-form";
import { EditHostForm } from "@/modules/booking/hosts/components/edit-host-form";
import { deleteHostAction } from "@/modules/booking/hosts/actions/delete-host.action";
import { toggleHostActiveAction } from "@/modules/booking/hosts/actions/toggle-host-active.action";
import type { ActionResult } from "@/lib/validators/common";

interface AddButtonLabels {
  addHost: string;
  displayName: string;
  publicTitle: string;
  hostSlug: string;
  timezone: string;
}

interface LabelsProps extends AddButtonLabels {
  active: string;
  inactive: string;
}

export function HostsAddButton({ labels }: { labels: AddButtonLabels }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <PlusIcon className="h-4 w-4" />
        {labels.addHost}
      </Button>

      <AddHostForm
        isOpen={open}
        onClose={() => setOpen(false)}
        labels={labels}
      />
    </>
  );
}

interface HostItem {
  id: string;
  host_slug: string;
  display_name: string;
  public_title: string | null;
  timezone: string;
  is_active: boolean;
  sort_order: number;
}

function ToggleActiveButton({
  hostId,
  isActive,
  activeLabel,
  inactiveLabel,
}: {
  hostId: string;
  isActive: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const [, formAction, isPending] = useActionState<ActionResult, FormData>(
    toggleHostActiveAction,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={hostId} />
      <input type="hidden" name="is_active" value={String(isActive)} />
      <button
        type="submit"
        disabled={isPending}
        title={isActive ? "Деактивировать" : "Активировать"}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity disabled:opacity-50 hover:opacity-80 cursor-pointer ${
          isActive
            ? "bg-accent-green-soft text-text-primary"
            : "bg-surface-sunken text-text-muted"
        }`}
      >
        {isPending ? "…" : isActive ? activeLabel : inactiveLabel}
      </button>
    </form>
  );
}

function DeleteButton({ hostId }: { hostId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    deleteHostAction,
    {},
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-7 w-7 items-center justify-center rounded-(--neu-radius-sm) text-text-muted hover:bg-danger-soft hover:text-danger transition-colors"
        title="Удалить"
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={hostId} />
      {state.error && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-(--neu-radius-sm) bg-danger px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "…" : "Удалить"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-(--neu-radius-sm) px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        Отмена
      </button>
    </form>
  );
}

export function HostsListClient({
  hosts,
  labels,
}: {
  hosts: HostItem[];
  labels: LabelsProps;
}) {
  const [editingHost, setEditingHost] = useState<HostItem | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hosts.map((host) => (
          <div
            key={host.id}
            className="flex items-center gap-4 rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card p-4"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-secondary text-lg font-semibold">
              {host.display_name.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary truncate">{host.display_name}</p>
              {host.public_title && (
                <p className="text-sm text-text-secondary truncate">{host.public_title}</p>
              )}
              <p className="text-xs text-text-muted mt-0.5">/{host.host_slug}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ToggleActiveButton
                hostId={host.id}
                isActive={host.is_active}
                activeLabel={labels.active}
                inactiveLabel={labels.inactive}
              />

              <button
                type="button"
                onClick={() => setEditingHost(host)}
                className="flex h-7 w-7 items-center justify-center rounded-(--neu-radius-sm) text-text-muted hover:bg-surface-sunken hover:text-text-primary transition-colors"
                title="Редактировать"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>

              <DeleteButton hostId={host.id} />
            </div>
          </div>
        ))}
      </div>

      {editingHost && (
        <EditHostForm
          host={editingHost}
          isOpen={true}
          onClose={() => setEditingHost(null)}
          labels={labels}
        />
      )}
    </>
  );
}
