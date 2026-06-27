import "server-only";
import { extractPdfText, PDF_TEXT_MIN_LENGTH } from "./pdf-parse-extractor";
import type { NormalizationInput } from "@/modules/ai/services/normalize-financial-document";
import type { ExtractionProvider } from "../types/document-extraction.types";

/**
 * Provider router (spec §8). Decides WHICH extractor to use from the file type
 * and (for PDFs) whether a usable text layer exists:
 *
 *   PDF with text layer (len > 100)  → pdf_parse        (cheap, no AI vision)
 *   scanned PDF / weak text layer    → anthropic_vision (PDF document block)
 *   image (png/jpg/jpeg/webp/gif)    → anthropic_vision (image block)
 *   anything else (docx/heic/…)      → unsupported_file_type → needs_review
 *
 * The abstraction keeps room for google_vision / azure / mindee / veryfi later
 * without touching callers — only this file changes.
 */

const ANTHROPIC_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export type ExtractionRoute =
  | {
      ok: true;
      provider: ExtractionProvider;
      rawText: string | null;
      normalization: NormalizationInput;
    }
  | { ok: false; errorCode: "unsupported_file_type"; errorMessage: string };

export async function routeExtraction(params: {
  buffer: Buffer;
  mimeType: string | null;
  extension: string | null;
}): Promise<ExtractionRoute> {
  const ext = (params.extension ?? "").toLowerCase();
  const mime = (params.mimeType ?? "").toLowerCase();
  const isPdf = mime === "application/pdf" || ext === "pdf";

  if (isPdf) {
    const pdf = await extractPdfText(params.buffer);
    if (pdf.ok && pdf.text.length > PDF_TEXT_MIN_LENGTH) {
      return {
        ok: true,
        provider: "pdf_parse",
        rawText: pdf.text,
        normalization: { kind: "text", text: pdf.text },
      };
    }
    // Scanned / image-only PDF — let the multimodal model read it directly.
    return {
      ok: true,
      provider: "anthropic_vision",
      rawText: null,
      normalization: { kind: "pdf", base64: params.buffer.toString("base64") },
    };
  }

  const mediaType = ANTHROPIC_IMAGE_MIME.has(mime) ? mime : IMAGE_EXT_TO_MIME[ext];
  if (mediaType) {
    return {
      ok: true,
      provider: "anthropic_vision",
      rawText: null,
      normalization: { kind: "image", base64: params.buffer.toString("base64"), mediaType },
    };
  }

  return {
    ok: false,
    errorCode: "unsupported_file_type",
    errorMessage: "This file type can't be read automatically. Supported: PDF, PNG, JPG, JPEG, WEBP.",
  };
}
