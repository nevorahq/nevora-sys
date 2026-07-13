/** The upload schema caps titles at 160 chars; stay under it. */
const CAPTURE_TITLE_MAX = 160;

/**
 * A safe, human title for a photo/document capture — the composer never asks the
 * user to type one. Prefer the first file's name (sans extension); fall back to
 * "Photo capture <date>" / "Document capture <date>" when the name is empty or
 * generic. Kept pure so it is trivially testable and identical on client/server.
 */
export function generateCaptureTitle(params: {
  filename?: string | null;
  entryType: "photo" | "document";
  now?: Date;
}): string {
  const date = (params.now ?? new Date()).toISOString().slice(0, 10);
  const fallback = params.entryType === "photo" ? `Photo capture ${date}` : `Document capture ${date}`;

  const raw = (params.filename ?? "").trim();
  if (!raw) return fallback;

  const base = raw.replace(/\.[^.]+$/, "").trim();
  // Camera roll names carry no meaning — don't dress them up as a real title.
  const generic = /^(image|img|photo|scan|untitled|document|capture)[-_ ]?\d*$/i;
  if (!base || generic.test(base)) return fallback;

  return base.slice(0, CAPTURE_TITLE_MAX);
}
