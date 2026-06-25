"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, FileTextIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { ROUTES } from "@/shared/config/routes";
import {
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILES,
  DOCUMENT_MAX_TOTAL_SIZE_BYTES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_UPLOAD_ACCEPT,
} from "../constants/document.constants";
import { validateDocumentFiles } from "../services/validate-document-file";

const TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function NewDocumentForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    const merged = [...files, ...Array.from(nextFiles)];
    const validation = validateDocumentFiles(merged);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setFiles(merged);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {error && <div role="alert" className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}
      <div className="soft-card flex flex-col gap-5 p-5 sm:p-6">
        <Input id="title" name="title" label="Title *" placeholder="e.g. June supplier invoice" required maxLength={160} />
        <Select id="doc_type" name="doc_type" label="Document type" options={TYPE_OPTIONS} defaultValue="note" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-text-secondary">Notes</label>
          <textarea id="description" name="description" rows={5} maxLength={5000} placeholder="Add context for your team…" className="soft-control w-full resize-y px-4 py-2.5 text-sm" />
        </div>
      </div>

      <div className="soft-card flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Attachments</h2>
          <p className="mt-1 text-sm text-text-muted">Add up to {DOCUMENT_MAX_FILES} files, 10 MB each (25 MB total).</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button type="button" variant="secondary" className="min-h-12" onClick={() => cameraInputRef.current?.click()}>
            <CameraIcon size={18} /> Take a photo
          </Button>
          <Button type="button" variant="secondary" className="min-h-12" onClick={() => fileInputRef.current?.click()}>
            <PaperclipIcon size={18} /> Add files
          </Button>
        </div>
        <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
        <input ref={fileInputRef} className="sr-only" type="file" multiple accept={DOCUMENT_UPLOAD_ACCEPT} onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />

        {files.length > 0 && (
          <div className="flex flex-col gap-2" aria-live="polite">
            {files.map((file, index) => <AttachmentPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />)}
            <p className="pt-1 text-xs text-text-muted">{files.length}/{DOCUMENT_MAX_FILES} files · {formatBytes(totalSize)}/{formatBytes(DOCUMENT_MAX_TOTAL_SIZE_BYTES)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => router.push(ROUTES.documents)}>Cancel</Button>
        <Button type="submit" isLoading={isSubmitting} className="min-h-12">{isSubmitting ? "Uploading…" : "Create document"}</Button>
      </div>
    </form>
  );
}

function AttachmentPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const image = ["png", "jpg", "jpeg", "webp"].includes(extension ?? "");
  const [previewUrl] = useState<string | null>(() => image ? URL.createObjectURL(file) : null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  return <div className="flex items-center gap-3 rounded-(--neu-radius-md) bg-surface-sunken p-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-(--neu-radius-sm) bg-surface text-text-secondary">{previewUrl ? <Image src={previewUrl} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" /> : image ? <ImageIcon size={18} /> : <FileTextIcon size={18} />}</div>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{file.name}</p><p className="text-xs text-text-muted">{formatBytes(file.size)}{["heic", "heif"].includes(extension ?? "") ? " · Preview will be available later" : ""}</p></div>
    <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`} className="rounded-(--neu-radius-sm) p-2 text-text-muted hover:bg-surface hover:text-danger"><Trash2Icon size={17} /></button>
  </div>;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= DOCUMENT_MAX_FILE_SIZE_BYTES ? 1 : 2)} MB`;
}
