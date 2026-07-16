"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { BillingRequiredAlert, useAccessState, useAccessGate } from "@/modules/billing/components/access-state";
import { ROUTES } from "@/shared/config/routes";
import { DOCUMENT_MAX_FILES, DOCUMENT_TYPES } from "../constants/document.constants";
import { DocumentFileUpload } from "./document-file-upload";
import { useDocumentFiles } from "../hooks/use-document-files";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export function NewDocumentForm({ t }: { t: Dictionary["documents"] }) {
  const router = useRouter();
  const { files, error: fileError, addFiles, removeFile } = useDocumentFiles();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { blocked } = useAccessGate("write");
  // Localized plan-gate copy comes from the AccessState context (dict.access).
  const uploadBlockedMessage = useAccessState().blocked.upload;
  const typeOptions = DOCUMENT_TYPES.map((value) => ({ value, label: t.types[value] }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) {
      setError(uploadBlockedMessage);
      return;
    }
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    files.forEach((file) => formData.append("files", file));
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? t.form.createFailed);
        return;
      }
      router.push(ROUTES.documents);
      router.refresh();
    } catch {
      setError(t.form.networkError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {blocked && <BillingRequiredAlert title={t.form.uploadRestricted} message={uploadBlockedMessage} />}
      {error && <div role="alert" className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="soft-card flex flex-col gap-5 p-5 sm:p-6">
        <Input id="title" name="title" label={t.form.titleLabel} placeholder={t.form.titlePlaceholder} required maxLength={160} />
        <Select id="doc_type" name="doc_type" label={t.form.typeLabel} options={typeOptions} defaultValue="note" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-text-secondary">{t.form.notesLabel}</label>
          <textarea id="description" name="description" rows={5} maxLength={5000} placeholder={t.form.notesPlaceholder} className="soft-control w-full resize-y px-4 py-2.5 text-sm" />
        </div>
      </div>

      <div className="soft-card p-5 sm:p-6">
        <DocumentFileUpload
          files={files}
          error={fileError}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          title={t.form.attachments}
          description={t.form.attachmentsHint.replace("{max}", String(DOCUMENT_MAX_FILES))}
          attachedFilesLabel={t.upload.attachedFiles}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => router.push(ROUTES.documents)}>{t.form.cancel}</Button>
        <Button type="submit" disabled={blocked} isLoading={isSubmitting} className="min-h-12">{isSubmitting ? t.form.uploading : t.form.create}</Button>
      </div>
    </form>
  );
}
