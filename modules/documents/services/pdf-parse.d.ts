// Minimal type shim for pdf-parse (ships no types). We import the lib entry
// point directly to avoid the package's index.js debug-file read.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
    metadata?: unknown;
  }
  function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
