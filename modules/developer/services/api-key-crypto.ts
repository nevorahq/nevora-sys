import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateDeveloperApiKey(environment: "live" | "test" = "live"): string {
  return `nva_${environment}_${randomBytes(24).toString("base64url")}`;
}

export function hashDeveloperApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function developerApiKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 18);
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
