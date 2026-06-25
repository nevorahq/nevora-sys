"use client";

import { useActionState, useRef, useState } from "react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { updateServiceAction } from "../actions/update-service.action";
import type { ActionResult } from "@/lib/validators/common";

interface ServiceData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  booking_window_days: number;
}

interface EditServiceFormProps {
  service: ServiceData;
  isOpen: boolean;
  onClose: () => void;
  labels: {
    name: string;
    duration: string;
    durationUnit: string;
    bookingWindow: string;
    bookingWindowUnit: string;
  };
}

export function EditServiceForm({ service, isOpen, onClose, labels }: EditServiceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [slug, setSlug] = useState(service.slug);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const result = await updateServiceAction(prev, fd);
      if (!result.error && !result.fieldErrors) {
        onClose();
      }
      return result;
    },
    {},
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Редактировать услугу">
      <form ref={formRef} action={formAction} className="flex flex-col gap-4 pt-1">
        <input type="hidden" name="id" value={service.id} />

        {state.error && (
          <div
            className="rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger"
            role="alert"
          >
            {state.error}
          </div>
        )}

        <Input
          id="edit-service-name"
          name="name"
          label={labels.name}
          defaultValue={service.name}
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <div>
          <Input
            id="edit-service-slug"
            name="slug"
            label="URL Slug"
            required
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            error={state.fieldErrors?.slug?.[0]}
          />
          {slug && (
            <p className="mt-1 text-xs text-text-muted pl-1">/booking/…/{slug}</p>
          )}
        </div>

        <Input
          id="edit-service-description"
          name="description"
          label="Description (optional)"
          defaultValue={service.description ?? ""}
          error={state.fieldErrors?.description?.[0]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="edit-service-duration"
            name="duration_minutes"
            label={`${labels.duration} (${labels.durationUnit})`}
            type="number"
            min={5}
            max={480}
            defaultValue={service.duration_minutes}
            required
            error={state.fieldErrors?.duration_minutes?.[0]}
          />
          <Input
            id="edit-service-window"
            name="booking_window_days"
            label={`${labels.bookingWindow} (${labels.bookingWindowUnit})`}
            type="number"
            min={1}
            max={365}
            defaultValue={service.booking_window_days}
            required
            error={state.fieldErrors?.booking_window_days?.[0]}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "…" : "Сохранить"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
