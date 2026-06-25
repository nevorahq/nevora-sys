"use client";

import { useActionState, useRef, useState } from "react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Modal } from "@/shared/ui/modal";
import { createHostAction } from "../actions/create-host.action";
import type { ActionResult } from "@/lib/validators/common";

const TIMEZONES = [
  { value: "Europe/Chisinau",   label: "Chisinau (UTC+3)" },
  { value: "Europe/Bucharest",  label: "Bucharest (UTC+3)" },
  { value: "Europe/Kiev",       label: "Kyiv (UTC+3)" },
  { value: "Europe/Moscow",     label: "Moscow (UTC+3)" },
  { value: "Europe/London",     label: "London (UTC+0/+1)" },
  { value: "Europe/Paris",      label: "Paris (UTC+1/+2)" },
  { value: "America/New_York",  label: "New York (UTC-5/-4)" },
  { value: "UTC",               label: "UTC" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

interface AddHostFormProps {
  isOpen: boolean;
  onClose: () => void;
  labels: {
    addHost: string;
    displayName: string;
    publicTitle: string;
    hostSlug: string;
    timezone: string;
  };
}

export function AddHostForm({ isOpen, onClose, labels }: AddHostFormProps) {
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
      const result = await createHostAction(prev, fd);
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
    <Modal isOpen={isOpen} onClose={onClose} title={labels.addHost}>
      <form ref={formRef} action={formAction} className="flex flex-col gap-4 pt-1">
        {state.error && (
          <div className="rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
            {state.error}
          </div>
        )}

        <Input
          id="host-display-name"
          name="display_name"
          label={labels.displayName}
          placeholder="e.g. Ion Popescu"
          required
          onChange={handleNameChange}
          error={state.fieldErrors?.display_name?.[0]}
        />

        <div>
          <Input
            id="host-slug"
            name="host_slug"
            label={`${labels.hostSlug} (URL)`}
            placeholder="e.g. ion-popescu"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            error={state.fieldErrors?.host_slug?.[0]}
          />
          {slug && (
            <p className="mt-1 text-xs text-text-muted pl-1">
              /booking/…/{slug}
            </p>
          )}
        </div>

        <Input
          id="host-public-title"
          name="public_title"
          label={`${labels.publicTitle} (optional)`}
          placeholder="e.g. Senior Consultant"
          error={state.fieldErrors?.public_title?.[0]}
        />

        <Select
          id="host-timezone"
          name="timezone"
          label={labels.timezone}
          options={TIMEZONES}
          defaultValue="Europe/Chisinau"
          error={state.fieldErrors?.timezone?.[0]}
        />

        <div className="flex gap-3 pt-1">
          <Button
            type="submit"
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? "…" : labels.addHost}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
