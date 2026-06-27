import "server-only";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { sanitizePdfText } from "./sanitize-text";

export interface PdfTextResult {
  ok: boolean;
  text: string;
  pageCount: number;
}

/**
 * Extract the embedded text layer of a PDF. Cheap, no external API.
 *
 * Returns ok=false when the buffer is unparseable (encrypted/corrupt) so the
 * router can fall back to vision. Never throws. Output is sanitized so it is
 * safe both to send to the model and to persist.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  try {
    const result = await pdfParse(buffer);
    return {
      ok: true,
      text: sanitizePdfText((result.text ?? "").trim()),
      pageCount: result.numpages ?? 0,
    };
  } catch (err) {
    console.error("[extractPdfText] pdf-parse failed:", err);
    return { ok: false, text: "", pageCount: 0 };
  }
}

/** A PDF needs OCR/vision fallback when its embedded text is missing or too short. */
export const PDF_TEXT_MIN_LENGTH = 100;
