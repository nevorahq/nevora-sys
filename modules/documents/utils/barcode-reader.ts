/**
 * Client-side QR / barcode reading for the Inbox Scan mode.
 *
 * Uses the browser's own `BarcodeDetector` where it exists (Chrome on Android
 * and macOS) and otherwise the `barcode-detector` ponyfill on zxing-wasm (iOS
 * Safari, Firefox). The ponyfill and its .wasm load only when first needed, and
 * the .wasm is served from our own origin — never a CDN.
 */

export interface DetectedCode {
  raw: string;
  format: string;
}

type Source = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | Blob;

interface Detector {
  detect(source: Source): Promise<Array<{ rawValue: string; format: string }>>;
}

/** Symbologies found on receipts and invoices. */
const RECEIPT_FORMATS = [
  "qr_code",
  "data_matrix",
  "pdf417",
  "aztec",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
] as const;

/** Public path of the self-hosted zxing reader .wasm, per zxing-wasm version. */
export function zxingWasmPath(version: string): string {
  return `/vendor/zxing-wasm/${version}/zxing_reader.wasm`;
}

let detectorPromise: Promise<Detector> | null = null;

/** One shared detector per page; creating one compiles the .wasm. */
export function getBarcodeDetector(): Promise<Detector> {
  detectorPromise ??= createDetector().catch((error) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      const formats = RECEIPT_FORMATS.filter((format) => supported.includes(format));
      if (formats.includes("qr_code")) return new native({ formats });
    } catch {
      // Fall through to the ponyfill.
    }
  }

  const { BarcodeDetector, ZXING_WASM_VERSION, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? zxingWasmPath(ZXING_WASM_VERSION) : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: [...RECEIPT_FORMATS] });
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * The first code in the source, preferring a QR code (it carries the most) over
 * a linear barcode. Null when there is none or the reader failed.
 */
export async function detectCode(source: Source): Promise<DetectedCode | null> {
  try {
    const detector = await getBarcodeDetector();
    const found = await detector.detect(source);
    const best = found.find((code) => code.format === "qr_code") ?? found[0];
    return best?.rawValue ? { raw: best.rawValue, format: best.format } : null;
  } catch {
    return null;
  }
}
