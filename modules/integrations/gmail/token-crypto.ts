import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { GmailConfigurationError } from "./gmail-config";

const VERSION = "v1";
const IV_BYTES = 12;

function decodeKey(value: string): Buffer {
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64url");

  if (key.length !== 32) {
    throw new GmailConfigurationError(
      "GMAIL_TOKEN_ENCRYPTION_KEY must be a 32-byte base64/base64url value or 64 hex characters.",
    );
  }
  return key;
}

export function encryptGmailToken(token: string, encodedKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptGmailToken(value: string, encodedKey: string): string {
  const [version, ivValue, tagValue, encryptedValue, ...rest] = value.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || rest.length > 0) {
    throw new Error("The stored Gmail credential has an unsupported format.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("The stored Gmail credential could not be decrypted.");
  }
}
