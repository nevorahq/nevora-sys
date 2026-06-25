"use client";

import { useActionState, useState } from "react";
import { ClockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AddServiceForm } from "@/modules/booking/services/components/add-service-form";
import { EditServiceForm } from "@/modules/booking/services/components/edit-service-form";
import { deleteServiceAction } from "@/modules/booking/services/actions/delete-service.action";
import type { ActionResult } from "@/lib/validators/common";

interface AddButtonLabels {
  addService: string;
  name: string;
  duration: string;
  durationUnit: string;
  bookingWindow: string;
  bookingWindowUnit: string;
}

interface LabelsProps extends AddButtonLabels {
  active: string;
  slotInterval: string;
  bufferBefore: string;
  bufferAfter: string;
}

export function ServicesAddButton({ labels }: { labels: AddButtonLabels }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <PlusIcon className="h-4 w-4" />
        {labels.addService}
      </Button>

      <AddServiceForm
        isOpen={open}
        onClose={() => setOpen(false)}
        labels={labels}
      />
    </>
  );
}

interface ServiceItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  booking_window_days: number;
  is_active: boolean;
}

function DeleteButton({ serviceId }: { serviceId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    deleteServiceAction,
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
      <input type="hidden" name="id" value={serviceId} />
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

export function ServicesListClient({
  services,
  labels,
}: {
  services: ServiceItem[];
  labels: LabelsProps;
}) {
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        {services.map((svc) => (
          <div
            key={svc.id}
            className="rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">{svc.name}</p>
                {svc.description && (
                  <p className="mt-0.5 text-sm text-text-secondary line-clamp-2">
                    {svc.description}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-text-muted">/{svc.slug}</p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    svc.is_active
                      ? "bg-accent-green-soft text-text-primary"
                      : "bg-surface-sunken text-text-muted"
                  }`}
                >
                  {svc.is_active ? labels.active : "Inactive"}
                </span>

                <button
                  type="button"
                  onClick={() => setEditingService(svc)}
                  className="flex h-7 w-7 items-center justify-center rounded-(--neu-radius-sm) text-text-muted hover:bg-surface-sunken hover:text-text-primary transition-colors"
                  title="Редактировать"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>

                <DeleteButton serviceId={svc.id} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <ClockIcon className="h-3.5 w-3.5" />
                <span>{svc.duration_minutes} {labels.durationUnit}</span>
              </div>
              <div className="text-xs text-text-muted">
                {labels.slotInterval}: {svc.slot_interval_minutes} {labels.durationUnit}
              </div>
              <div className="text-xs text-text-muted">
                {labels.bookingWindow}: {svc.booking_window_days} {labels.bookingWindowUnit}
              </div>
              {svc.buffer_before_minutes > 0 && (
                <div className="text-xs text-text-muted">
                  {labels.bufferBefore}: {svc.buffer_before_minutes} {labels.durationUnit}
                </div>
              )}
              {svc.buffer_after_minutes > 0 && (
                <div className="text-xs text-text-muted">
                  {labels.bufferAfter}: {svc.buffer_after_minutes} {labels.durationUnit}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editingService && (
        <EditServiceForm
          service={editingService}
          isOpen={true}
          onClose={() => setEditingService(null)}
          labels={labels}
        />
      )}
    </>
  );
}
