/**
 * Strip characters PostgreSQL cannot store. pdf-parse routinely emits NUL
 * (U+0000) and other C0 control bytes from a PDF's text layer; writing those
 * to a `text`/`jsonb` column fails with "unsupported Unicode escape sequence".
 * Keep tab/newline/carriage-return, drop the rest of the C0 range and any lone
 * UTF-16 surrogate. Implemented as a code-point scan so the source carries no
 * literal control bytes — pure + dependency-free so it is unit-testable.
 */
export function sanitizePdfText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // C0 controls (< 0x20) except tab (9), newline (10), carriage return (13).
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    // Lone UTF-16 surrogates break JSON/Postgres text encoding.
    if (code >= 0xd800 && code <= 0xdfff) continue;
    out += ch;
  }
  return out;
}
