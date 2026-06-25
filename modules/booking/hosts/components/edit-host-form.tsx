"use client";

import { useActionState, useState } from "react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Modal } from "@/shared/ui/modal";
import { updateHostAction } from "../actions/update-host.action";
import type { ActionResult } from "@/lib/validators/common";

const TIMEZONES = [
  { value: "Europe/Chisinau",  label: "Chisinau (UTC+3)" },
  { value: "Europe/Bucharest", label: "Bucharest (UTC+3)" },
  { value: "Europe/Kiev",      label: "Kyiv (UTC+3)" },
  { value: "Europe/Moscow",    label: "Moscow (UTC+3)" },
  { value: "Europe/London",    label: "London (UTC+0/+1)" },
  { value: "Europe/Paris",     label: "Paris (UTC+1/+2)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "UTC",              label: "UTC" },
];

interface HostData {
  id: string;
  display_name: string;
  host_slug: string;
  public_title: string | null;
  timezone: string;
}

interface EditHostFormProps {
  host: HostData;
  isOpen: boolean;
  onClose: () => void;
  labels: {
    displayName: string;
    publicTitle: string;
    hostSlug: string;
    timezone: string;
  };
}

export function EditHostForm({ host, isOpen, onClose, labels }: EditHostFormProps) {
  const [slug, setSlug] = useState(host.host_slug);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const result = await updateHostAction(prev, fd);
      if (!result.error && !result.fieldErrors) {
        onClose();
      }
      return result;
    },
    {},
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Редактировать специалиста">
      <form action={formAction} className="flex flex-col gap-4 pt-1">
        <input type="hidden" name="id" value={host.id} />

        {state.error && (
          <div
            className="rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger"
            role="alert"
          >
            {state.error}
          </div>
        )}

        <Input
          id="edit-host-name"
          name="display_name"
          label={labels.displayName}
          defaultValue={host.display_name}
          required
          error={state.fieldErrors?.display_name?.[0]}
        />

        <div>
          <Input
            id="edit-host-slug"
            name="host_slug"
            label={`${labels.hostSlug} (URL)`}
            required
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            error={state.fieldErrors?.host_slug?.[0]}
          />
          {slug && (
            <p className="mt-1 text-xs text-text-muted pl-1">/booking/…/{slug}</p>
          )}
        </div>

        <Input
          id="edit-host-title"
          name="public_title"
          label={`${labels.publicTitle} (optional)`}
          defaultValue={host.public_title ?? ""}
          error={state.fieldErrors?.public_title?.[0]}
        />

        <Select
          id="edit-host-timezone"
          name="timezone"
          label={labels.timezone}
          options={TIMEZONES}
          defaultValue={host.timezone}
          error={state.fieldErrors?.timezone?.[0]}
        />

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
