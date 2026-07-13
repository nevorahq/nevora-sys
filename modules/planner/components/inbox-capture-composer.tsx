"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, FileTextIcon, TypeIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useDocumentFiles } from "@/modules/documents/hooks/use-document-files";
import { DocumentFileUpload } from "@/modules/documents/components/document-file-upload";
import { CaptureInput } from "./capture-input";

type Mode = "text" | "photo" | "document";

interface InboxCaptureComposerProps {
  dict: Dictionary["inbox"];
  /** Organization name shown in the "saved to Documents" disclosure. */
  orgName: string;
}

/**
 * The single Inbox capture surface, now multimodal.
 *
 * A compact segmented control switches between three modes without changing the
 * page's dimensions. Text is unchanged — it delegates to the existing
 * {@link CaptureInput} Server Action. Photo and Document capture bytes and POST
 * them to the Inbox binary endpoint, which reuses the Documents upload service
 * (storage, validation, billing, rollback, extraction) — no second file store.
 *
 * Money is never touched here: a capture may produce a reviewable draft, but only
 * an explicit confirmation posts a transaction.
 */
export function InboxCaptureComposer({ dict, orgName }: InboxCaptureComposerProps) {
  const [mode, setMode] = useState<Mode>("text");

  const modes: { id: Mode; label: string; icon: typeof TypeIcon }[] = [
    { id: "text", label: dict.composer.modeText, icon: TypeIcon },
    { id: "photo", label: dict.composer.modePhoto, icon: CameraIcon },
    { id: "document", label: dict.composer.modeDocument, icon: FileTextIcon },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label={dict.title} className="flex gap-1 rounded-(--neu-radius-md) bg-surface-sunken p-1">
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-(--neu-radius-sm) px-3 py-2 text-sm font-medium transition-all",
              mode === id ? "bg-surface text-text-primary shadow-neu" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Text keeps the existing behavior verbatim. */}
      <div className={mode === "text" ? "block" : "hidden"}>
        <CaptureInput dict={dict} />
      </div>
      {mode === "photo" && <BinaryCapture key="photo" mode="photo" dict={dict} orgName={orgName} />}
      {mode === "document" && <BinaryCapture key="document" mode="document" dict={dict} orgName={orgName} />}
    </div>
  );
}

type UploadStatus = "idle" | "uploading" | "error" | "done";

function BinaryCapture({
  mode,
  dict,
  orgName,
}: {
  mode: "photo" | "document";
  dict: Dictionary["inbox"];
  orgName: string;
}) {
  const router = useRouter();
  const { files, error: fileError, addFiles, removeFile, clearFiles } = useDocumentFiles();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Held across retries so a re-submit reuses the same capture — the server treats
  // it as idempotent and never stores a second Document.
  const captureIdRef = useRef<string | null>(null);

  const isUploading = status === "uploading";

  async function submit() {
    if (files.length === 0) {
      setSubmitError(dict.composer.selectFilesFirst);
      return;
    }
    if (!captureIdRef.current) captureIdRef.current = crypto.randomUUID();
    setStatus("uploading");
    setSubmitError(null);
    setWarning(null);

    const formData = new FormData();
    formData.set("captureId", captureIdRef.current);
    formData.set("entryType", mode);
    formData.set("note", note);
    for (const file of files) formData.append("files", file);

    try {
      const response = await fetch("/api/inbox/capture", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { error?: string; warning?: string | null };
      if (!response.ok) {
        // Keep captureIdRef so a Retry reuses the same idempotent capture.
        setSubmitError(data.error || dict.composer.captureError);
        setStatus("error");
        return;
      }
      captureIdRef.current = null;
      clearFiles();
      setNote("");
      setWarning(data.warning ?? null);
      setStatus("done");
      router.refresh();
    } catch {
      setSubmitError(dict.composer.captureError);
      setStatus("error");
    }
  }

  return (
    <div className="soft-card flex flex-col gap-3 p-4">
      {mode === "photo" ? (
        <PhotoPicker dict={dict} files={files} error={fileError} onAddFiles={addFiles} onClear={clearFiles} />
      ) : (
        <DocumentFileUpload
          files={files}
          error={fileError}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          title={dict.composer.documentTitle}
          description={dict.composer.documentDescription}
          filesLabel={dict.composer.filesLabel}
          removeLabel={dict.composer.removeLabel}
          // Camera capture lives in the Photo mode; duplicating it here would
          // blur the segmented control's meaning.
          showCamera={false}
        />
      )}

      <label className="sr-only" htmlFor={`capture-note-${mode}`}>
        {dict.composer.notePlaceholder}
      </label>
      <textarea
        id={`capture-note-${mode}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder={dict.composer.notePlaceholder}
        className="w-full resize-none rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3 text-sm text-text-primary shadow-neu-inset placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-yellow/40"
      />

      <p className="text-xs text-text-muted">{dict.composer.savedToDocuments.replace("{{org}}", orgName)}</p>

      {submitError && (
        <p role="alert" className="text-xs font-medium text-danger">
          {submitError}
        </p>
      )}
      {warning && (
        <p role="status" className="text-xs font-medium text-accent-yellow">
          {warning}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-tertiary" aria-live="polite">
          {isUploading ? dict.composer.processingHint : ""}
        </span>
        <div className="flex gap-2">
          {status === "error" && (
            <Button type="button" variant="secondary" onClick={submit} disabled={isUploading}>
              {dict.composer.retry}
            </Button>
          )}
          <Button type="button" onClick={submit} isLoading={isUploading} disabled={isUploading || files.length === 0}>
            {isUploading ? dict.composer.uploading : dict.composer.uploadButton}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Photo mode: the platform camera/file input (no custom getUserMedia UI) with a
 * single-image preview. Picking a new photo replaces the previous one.
 */
function PhotoPicker({
  dict,
  files,
  error,
  onAddFiles,
  onClear,
}: {
  dict: Dictionary["inbox"];
  files: File[];
  error?: string | null;
  onAddFiles: (files: FileList | null) => void;
  onClear: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const file = files[0] ?? null;
  // Derived, not stored — avoids a setState-in-effect cascade. The cleanup effect
  // only revokes the URL when it changes or unmounts.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="rounded-(--neu-radius-md) border border-border-soft bg-surface-sunken p-4">
      <h2 className="text-sm font-semibold text-text-primary">{dict.composer.photoTitle}</h2>
      <p className="mt-1 text-xs text-text-muted">{dict.composer.photoDescription}</p>

      <Button type="button" variant="secondary" className="mt-3 min-h-11 w-full" onClick={() => cameraRef.current?.click()}>
        <CameraIcon size={17} /> {dict.composer.cameraLabel}
      </Button>
      <input
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          // Single image: replace whatever was chosen before.
          onClear();
          onAddFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      {file && previewUrl && (
        <div className="mt-4 flex items-center gap-3 rounded-(--neu-radius-md) bg-surface p-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-(--neu-radius-sm) bg-surface-sunken">
            <Image src={previewUrl} alt="" width={56} height={56} unoptimized className="h-full w-full object-cover" />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{file.name}</p>
          <button
            type="button"
            onClick={onClear}
            aria-label={`${dict.composer.removeLabel} ${file.name}`}
            className="rounded-(--neu-radius-sm) p-2 text-text-muted hover:bg-surface-sunken hover:text-danger"
          >
            <Trash2Icon size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
