"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CameraIcon, FileTextIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DOCUMENT_MAX_FILES,
  DOCUMENT_MAX_TOTAL_SIZE_BYTES,
  DOCUMENT_UPLOAD_ACCEPT,
} from "../constants/document.constants";

interface DocumentFileUploadProps {
  files: File[];
  error?: string | null;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  title?: string;
  description?: string;
  cameraLabel?: string;
  filesLabel?: string;
  removeLabel?: string;
  attachedFilesLabel?: string;
  /**
   * Hide the camera button when the surrounding surface already offers a
   * dedicated photo mode (the Inbox composer's Document tab). Defaults to true —
   * the Documents screen keeps both entry points.
   */
  showCamera?: boolean;
}

export function DocumentFileUpload({
  files,
  error,
  onAddFiles,
  onRemoveFile,
  title = "Documents",
  description = "Attach invoice, receipt, contract or photo",
  cameraLabel = "Take a photo",
  filesLabel = "Add files",
  removeLabel = "Remove",
  attachedFilesLabel = "Attached files",
  showCamera = true,
}: DocumentFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="rounded-(--neu-radius-md) border border-border-soft bg-surface-sunken p-4">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>

      <div className={`mt-3 grid grid-cols-1 gap-2 ${showCamera ? "sm:grid-cols-2" : ""}`}>
        {showCamera && (
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => cameraInputRef.current?.click()}>
            <CameraIcon size={17} /> {cameraLabel}
          </Button>
        )}
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => fileInputRef.current?.click()}>
          <PaperclipIcon size={17} /> {filesLabel}
        </Button>
      </div>

      {showCamera && (
        <input
          ref={cameraInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      )}
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        accept={DOCUMENT_UPLOAD_ACCEPT}
        onChange={(event) => {
          onAddFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {error && <p role="alert" className="mt-2 text-xs font-medium text-danger">{error}</p>}

      {files.length > 0 && (
        <div className="mt-4" aria-live="polite">
          <p className="mb-2 text-xs font-medium text-text-secondary">{attachedFilesLabel}</p>
          <div className="space-y-2">
            {files.map((file, index) => (
              <DocumentFilePreview
                key={`${file.name}-${file.lastModified}-${index}`}
                file={file}
                removeLabel={removeLabel}
                onRemove={() => onRemoveFile(index)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {files.length}/{DOCUMENT_MAX_FILES} files · {formatBytes(totalSize)}/{formatBytes(DOCUMENT_MAX_TOTAL_SIZE_BYTES)}
          </p>
        </div>
      )}
    </div>
  );
}

function DocumentFilePreview({ file, removeLabel, onRemove }: { file: File; removeLabel: string; onRemove: () => void }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(extension);
  const canPreview = ["png", "jpg", "jpeg", "webp"].includes(extension);
  const [previewUrl] = useState<string | null>(() => canPreview ? URL.createObjectURL(file) : null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="flex items-center gap-3 rounded-(--neu-radius-md) bg-surface p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-(--neu-radius-sm) bg-surface-sunken text-text-secondary">
        {previewUrl ? (
          <Image src={previewUrl} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" />
        ) : isImage ? (
          <ImageIcon size={18} />
        ) : (
          <FileTextIcon size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
        <p className="text-xs text-text-muted">{formatFileType(file, extension)} · {formatBytes(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel} ${file.name}`}
        className="rounded-(--neu-radius-sm) p-2 text-text-muted hover:bg-surface-sunken hover:text-danger"
      >
        <Trash2Icon size={17} />
      </button>
    </div>
  );
}

function formatFileType(file: File, extension: string): string {
  if (file.type === "application/pdf" || extension === "pdf") return "PDF";
  if (file.type.startsWith("image/")) return file.type.replace("image/", "").toUpperCase();
  return extension.toUpperCase() || file.type || "File";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
