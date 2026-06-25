"use client";

import { useActionState, useRef, useState } from "react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { createServiceAction } from "../actions/create-service.action";
import type { ActionResult } from "@/lib/validators/common";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

interface AddServiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  labels: {
    addService: string;
    name: string;
    duration: string;
    durationUnit: string;
    bookingWindow: string;
    bookingWindowUnit: string;
  };
}

export function AddServiceForm({ isOpen, onClose, labels }: AddServiceFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  // Reset state when the modal closes — adjust during render on prop change
  // instead of in an effect (avoids an extra render pass).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setSlug("");
      setSlugTouched(false);
    }
  }

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const result = await createServiceAction(prev, fd);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        setSlug("");
        setSlugTouched(false);
        onClose();
      }
      return result;
    },
    {},
  );

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugTouched) {
      setSlug(slugify(e.target.value));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={labels.addService}>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4 pt-1">
        {state.error && (
          <div
            className="rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger"
            role="alert"
          >
            {state.error}
          </div>
        )}

        <Input
          id="service-name"
          name="name"
          label={labels.name}
          placeholder="e.g. Consultation 30min"
          required
          onChange={handleNameChange}
          error={state.fieldErrors?.name?.[0]}
        />

        <div>
          <Input
            id="service-slug"
            name="slug"
            label="URL Slug"
            placeholder="e.g. consultation-30min"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            error={state.fieldErrors?.slug?.[0]}
          />
          {slug && (
            <p className="mt-1 text-xs text-text-muted pl-1">/booking/…/{slug}</p>
          )}
        </div>

        <Input
          id="service-description"
          name="description"
          label="Description (optional)"
          placeholder="Brief description of this service"
          error={state.fieldErrors?.description?.[0]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="service-duration"
            name="duration_minutes"
            label={`${labels.duration} (${labels.durationUnit})`}
            type="number"
            min={5}
            max={480}
            defaultValue={30}
            required
            error={state.fieldErrors?.duration_minutes?.[0]}
          />
          <Input
            id="service-booking-window"
            name="booking_window_days"
            label={`${labels.bookingWindow} (${labels.bookingWindowUnit})`}
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            required
            error={state.fieldErrors?.booking_window_days?.[0]}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "…" : labels.addService}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
