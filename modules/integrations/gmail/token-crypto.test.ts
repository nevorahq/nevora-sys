import { describe, expect, it } from "vitest";
import { decryptGmailToken, encryptGmailToken } from "./token-crypto";

const KEY = "11".repeat(32);

describe("Gmail token encryption", () => {
  it("round-trips a refresh token without storing plaintext", () => {
    const token = "1//google-refresh-token";
    const encrypted = encryptGmailToken(token, KEY);

    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptGmailToken(encrypted, KEY)).toBe(token);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptGmailToken("secret", KEY);
    const replacement = encrypted.endsWith("A") ? "B" : "A";
    expect(() => decryptGmailToken(`${encrypted.slice(0, -1)}${replacement}`, KEY)).toThrow(
      "could not be decrypted",
    );
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptGmailToken("secret", "too-short")).toThrow("32-byte");
  });
});
