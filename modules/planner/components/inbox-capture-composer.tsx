"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, FileTextIcon, ScanLineIcon, TypeIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { useDocumentFiles } from "@/modules/documents/hooks/use-document-files";
import { DocumentFileUpload } from "@/modules/documents/components/document-file-upload";
import { ReceiptReviewDialog } from "@/modules/documents/components/receipt-review-dialog";
import type { DetectedCode } from "@/modules/documents/utils/barcode-reader";
import { CaptureInput } from "./capture-input";
import { ReceiptScanner } from "./receipt-scanner";

type Mode = "text" | "photo" | "scan" | "document";
type BinaryMode = Exclude<Mode, "text">;

interface InboxCaptureComposerProps {
  dict: Dictionary["inbox"];
  /** Organization name shown in the "saved to Documents" disclosure. */
  orgName: string;
  locale: Locale;
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
export function InboxCaptureComposer({ dict, orgName, locale }: InboxCaptureComposerProps) {
  const [mode, setMode] = useState<Mode>("text");

  const modes: { id: Mode; label: string; icon: typeof TypeIcon }[] = [
    { id: "text", label: dict.composer.modeText, icon: TypeIcon },
    { id: "photo", label: dict.composer.modePhoto, icon: CameraIcon },
    { id: "scan", label: dict.composer.modeScan, icon: ScanLineIcon },
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
            // On mobile the tab is icon-only, so the label must carry the name.
            aria-label={label}
            onClick={() => setMode(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-(--neu-radius-sm) px-3 py-2 text-sm font-medium transition-all",
              mode === id ? "bg-surface text-text-primary shadow-neu" : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
            <span className="hidden whitespace-nowrap md:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Text keeps the existing behavior verbatim. */}
      <div className={mode === "text" ? "block" : "hidden"}>
        <CaptureInput dict={dict} />
      </div>
      {mode !== "text" && <BinaryCapture key={mode} mode={mode} dict={dict} orgName={orgName} locale={locale} />}
    </div>
  );
}

type UploadStatus = "idle" | "uploading" | "error" | "done";

function BinaryCapture({
  mode,
  dict,
  orgName,
  locale,
}: {
  mode: BinaryMode;
  dict: Dictionary["inbox"];
  orgName: string;
  locale: Locale;
}) {
  const router = useRouter();
  const { files, error: fileError, addFiles, removeFile, clearFiles } = useDocumentFiles();
  // Scan mode: the QR/barcode read off the receipt, sent with its photo.
  const [code, setCode] = useState<DetectedCode | null>(null);
  // The just-captured Document whose receipt preview is open.
  const [reviewDocumentId, setReviewDocumentId] = useState<string | null>(null);
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
    // A scan is a photo capture that also carries the code it read.
    formData.set("entryType", mode === "document" ? "document" : "photo");
    formData.set("note", note);
    if (mode === "scan" && code) {
      formData.set("code", code.raw);
      formData.set("codeFormat", code.format);
    }
    for (const file of files) formData.append("files", file);

    try {
      const response = await fetch("/api/inbox/capture", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        warning?: string | null;
        documentId?: string;
      };
      if (!response.ok) {
        // Keep captureIdRef so a Retry reuses the same idempotent capture.
        setSubmitError(data.error || dict.composer.captureError);
        setStatus("error");
        return;
      }
      captureIdRef.current = null;
      clearFiles();
      setCode(null);
      setNote("");
      setWarning(data.warning ?? null);
      setStatus("done");
      router.refresh();
      // Preview the extracted receipt right away; it stays in Review if closed.
      if (data.documentId) setReviewDocumentId(data.documentId);
    } catch {
      setSubmitError(dict.composer.captureError);
      setStatus("error");
    }
  }

  return (
    <div className="soft-card flex flex-col gap-3 p-4">
      {mode === "photo" ? (
        <PhotoPicker dict={dict} files={files} error={fileError} onAddFiles={addFiles} onClear={clearFiles} />
      ) : mode === "scan" ? (
        <>
          <ReceiptScanner
            dict={dict.composer}
            file={files[0] ?? null}
            code={code}
            onCapture={(file, found) => {
              clearFiles();
              addFiles([file]);
              setCode(found);
            }}
            onClear={() => {
              clearFiles();
              setCode(null);
            }}
          />
          {fileError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {fileError}
            </p>
          )}
        </>
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
          attachedFilesLabel={dict.composer.attachedFiles}
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

      <ReceiptReviewDialog
        documentId={reviewDocumentId}
        onClose={() => setReviewDocumentId(null)}
        t={dict.receipt}
        locale={locale}
      />
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
