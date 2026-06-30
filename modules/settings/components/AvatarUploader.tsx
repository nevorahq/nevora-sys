"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CameraIcon, Trash2Icon } from "lucide-react";
import { updateAvatar } from "../actions/update-avatar";
import { removeAvatar } from "../actions/remove-avatar";
import type { SettingsActionState } from "../types/settings.types";
import { Button } from "@/shared/ui/button";

export function AvatarUploader({ avatarUrl, initials }: { avatarUrl: string | null; initials: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);

  async function uploadAvatarAction(previousState: SettingsActionState, formData: FormData) {
    const result = await updateAvatar(previousState, formData);
    if (result.success) {
      setPreviewUrl(null);
      setHasFile(false);
      if (inputRef.current) inputRef.current.value = "";
    }
    return result;
  }

  const [state, action, uploadPending] = useActionState<SettingsActionState, FormData>(uploadAvatarAction, {});

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const displayedAvatar = previewUrl ?? avatarUrl;

  function chooseFile(file: File | undefined) {
    setRemoveMessage(null);
    setHasFile(Boolean(file));
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function handleRemove() {
    if (!window.confirm("Remove your current avatar?")) return;
    setRemoveMessage(null);
    startRemoveTransition(async () => {
      const result = await removeAvatar();
      setRemoveMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border-soft pb-6 sm:flex-row sm:items-center">
      <div
        role="img"
        aria-label="Profile avatar"
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-cover bg-center text-lg font-semibold text-text-secondary ring-1 ring-border-soft"
        style={displayedAvatar ? { backgroundImage: `url(${JSON.stringify(displayedAvatar).slice(1, -1)})` } : undefined}
      >
        {!displayedAvatar && initials}
      </div>

      <div className="min-w-0 flex-1">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary shadow-neu-control transition-all hover:border-border-strong hover:shadow-neu-card">
            <CameraIcon size={15} />
            {avatarUrl ? "Choose new avatar" : "Choose avatar"}
            <input
              ref={inputRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
              required
            />
          </label>
          <Button type="submit" disabled={!hasFile} isLoading={uploadPending} className="px-4 py-2.5">
            {uploadPending ? "Uploading…" : "Upload"}
          </Button>
          {avatarUrl && (
            <Button type="button" variant="ghost" onClick={handleRemove} isLoading={removePending} className="px-3 py-2.5 text-danger">
              <Trash2Icon size={14} /> {removePending ? "Removing…" : "Remove"}
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-text-muted">JPEG, PNG, or WebP. Maximum 5 MB.</p>
        <p aria-live="polite" className={(state.error || state.fieldErrors?.avatar) ? "mt-2 text-sm text-danger" : "mt-2 text-sm text-accent-green"}>
          {state.fieldErrors?.avatar?.[0] ?? state.error ?? state.success ?? removeMessage}
        </p>
      </div>
    </div>
  );
}
