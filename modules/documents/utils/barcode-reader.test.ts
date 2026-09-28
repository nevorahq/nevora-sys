import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { zxingWasmPath } from "./barcode-reader";

/**
 * The reader .wasm is self-hosted under public/. Bumping `barcode-detector`
 * (and so zxing-wasm) without copying the matching binary would break scanning
 * on every browser without a native BarcodeDetector — this pins them together.
 * Fix: copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to the path.
 */
describe("self-hosted zxing wasm", () => {
  it("exists for the installed zxing-wasm version and matches its checksum", () => {
    const file = path.join(process.cwd(), "public", zxingWasmPath(ZXING_WASM_VERSION));
    expect(existsSync(file)).toBe(true);
    const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(sha256).toBe(ZXING_WASM_SHA256);
  });
});
