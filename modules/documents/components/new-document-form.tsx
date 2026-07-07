"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { BillingRequiredAlert, useAccessGate } from "@/modules/billing/components/access-state";
import { UPLOAD_BLOCKED_MESSAGE } from "@/modules/billing/services/access-state-ui";
import { ROUTES } from "@/shared/config/routes";
import {
  DOCUMENT_MAX_FILES,
  DOCUMENT_TYPE_LABELS,
} from "../constants/document.constants";
import { DocumentFileUpload } from "./document-file-upload";
import { useDocumentFiles } from "../hooks/use-document-files";

const TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function NewDocumentForm() {
  const router = useRouter();
  const { files, error: fileError, addFiles, removeFile } = useDocumentFiles();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { blocked } = useAccessGate("write");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) {
      setError(UPLOAD_BLOCKED_MESSAGE);
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
        setError(result.error ?? "We could not create the document.");
        return;
      }
      router.push(ROUTES.documents);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {blocked && <BillingRequiredAlert title="Загрузка ограничена" message={UPLOAD_BLOCKED_MESSAGE} />}
      {error && <div role="alert" className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="soft-card flex flex-col gap-5 p-5 sm:p-6">
        <Input id="title" name="title" label="Title *" placeholder="e.g. June supplier invoice" required maxLength={160} />
        <Select id="doc_type" name="doc_type" label="Document type" options={TYPE_OPTIONS} defaultValue="note" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-text-secondary">Notes</label>
          <textarea id="description" name="description" rows={5} maxLength={5000} placeholder="Add context for your team…" className="soft-control w-full resize-y px-4 py-2.5 text-sm" />
        </div>
      </div>

      <div className="soft-card p-5 sm:p-6">
        <DocumentFileUpload
          files={files}
          error={fileError}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          title="Attachments"
          description={`Add up to ${DOCUMENT_MAX_FILES} files, 10 MB each (25 MB total).`}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => router.push(ROUTES.documents)}>Cancel</Button>
        <Button type="submit" disabled={blocked} isLoading={isSubmitting} className="min-h-12">{isSubmitting ? "Uploading…" : "Create document"}</Button>
      </div>
    </form>
  );
}
