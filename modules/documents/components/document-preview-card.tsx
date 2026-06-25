import { DownloadIcon, FileIcon, FileTextIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import type { DocumentAttachment } from "../types/document.types";

export interface DocumentAttachmentPreview extends DocumentAttachment {
  signedUrl: string | null;
}

export function DocumentPreviewCard({ attachment }: { attachment: DocumentAttachmentPreview }) {
  const extension = attachment.file_name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(extension);
  const isPdf = extension === "pdf";
  const isHeic = extension === "heic" || extension === "heif";

  return (
    <article className="overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface">
      {isImage && attachment.signedUrl && (
        <Image src={attachment.signedUrl} alt={attachment.file_name} width={960} height={540} unoptimized className="aspect-video w-full bg-surface-sunken object-contain" />
      )}
      {isPdf && attachment.signedUrl && (
        <iframe title={`Preview: ${attachment.file_name}`} src={`${attachment.signedUrl}#view=FitH`} className="h-96 w-full bg-surface-sunken" />
      )}
      {(!isImage && !isPdf || !attachment.signedUrl) && (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 bg-surface-sunken px-5 text-center">
          {isHeic ? <ImageIcon size={28} className="text-text-muted" /> : <FileTextIcon size={28} className="text-text-muted" />}
          <p className="text-sm text-text-muted">{isHeic ? "File uploaded. HEIC/HEIF preview will be available later." : "Preview is not available for this file type."}</p>
        </div>
      )}
      <div className="flex items-center gap-3 p-3">
        <FileIcon size={17} className="shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{attachment.file_name}</p><p className="text-xs text-text-muted">{formatBytes(attachment.file_size ?? 0)}</p></div>
        {attachment.signedUrl && <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="rounded-(--neu-radius-sm) p-2 text-text-secondary hover:bg-surface-sunken hover:text-text-primary" aria-label={`Open ${attachment.file_name}`}><DownloadIcon size={18} /></a>}
      </div>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "Unknown size";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
