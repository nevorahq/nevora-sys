"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CameraIcon, Trash2Icon } from "lucide-react";
import { updateAvatar } from "../actions/update-avatar";
import { removeAvatar } from "../actions/remove-avatar";
import type { SettingsActionState } from "../types/settings.types";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export function AvatarUploader({
  avatarUrl,
  initials,
  t,
  common,
}: {
  avatarUrl: string | null;
  initials: string;
  t: Dictionary["settings"]["profile"]["avatar"];
  common: Dictionary["common"];
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

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

  function closeRemoveConfirmation() {
    setRemoveError(null);
    setIsConfirmingRemove(false);
  }

  function handleRemove() {
    setRemoveMessage(null);
    setRemoveError(null);
    startRemoveTransition(async () => {
      const result = await removeAvatar();
      if (result.error) {
        setRemoveError(result.error);
        return;
      }
      setIsConfirmingRemove(false);
      setRemoveMessage(result.success ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border-soft pb-6 sm:flex-row sm:items-center">
      <div
        role="img"
        aria-label={t.alt}
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-cover bg-center text-lg font-semibold text-text-secondary ring-1 ring-border-soft"
        style={displayedAvatar ? { backgroundImage: `url(${JSON.stringify(displayedAvatar).slice(1, -1)})` } : undefined}
      >
        {!displayedAvatar && initials}
      </div>

      <div className="min-w-0 flex-1">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary shadow-neu-control transition-all hover:border-border-strong hover:shadow-neu-card">
            <CameraIcon size={15} />
            {avatarUrl ? t.chooseNew : t.choose}
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
            {uploadPending ? t.uploading : t.upload}
          </Button>
          {avatarUrl && (
            <Button type="button" variant="ghost" onClick={() => setIsConfirmingRemove(true)} isLoading={removePending} className="px-3 py-2.5 text-danger">
              <Trash2Icon size={14} /> {removePending ? t.removing : t.remove}
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-text-muted">{t.hint}</p>
        <p aria-live="polite" className={(state.error || state.fieldErrors?.avatar) ? "mt-2 text-sm text-danger" : "mt-2 text-sm text-accent-green"}>
          {state.fieldErrors?.avatar?.[0] ?? state.error ?? state.success ?? removeMessage}
        </p>
      </div>

      <ConfirmDialog
        isOpen={isConfirmingRemove}
        onCancel={closeRemoveConfirmation}
        onConfirm={handleRemove}
        title={t.removeConfirmTitle}
        description={t.removeConfirmDescription}
        confirmLabel={t.remove}
        pendingLabel={t.removing}
        cancelLabel={common.cancel}
        closeLabel={common.close}
        isPending={removePending}
        error={removeError}
      />
    </div>
  );
}
