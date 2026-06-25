import { describe, it, expect } from "vitest";
import {
  RATE_LIMIT_BUCKETS,
  isAllowedBucket,
  isSha256Hex,
} from "./buckets";
import { buildRateLimitIdentifier } from "./identifier";

/**
 * Security boundary rate-лимитера: разрешены только бакеты из allowlist, а
 * identifier обязан быть SHA-256 hex. Это TS-зеркало серверного принуждения
 * (CASE + regex в migration 038), которое отвергает произвольные
 * bucket/identifier и тем самым закрывает abuse write-RPC.
 */
describe("rate-limit bucket allowlist", () => {
  it("принимает все объявленные бакеты", () => {
    for (const bucket of Object.keys(RATE_LIMIT_BUCKETS)) {
      expect(isAllowedBucket(bucket)).toBe(true);
    }
  });

  it("отвергает неизвестные/произвольные бакеты", () => {
    expect(isAllowedBucket("booking:malicious")).toBe(false);
    expect(isAllowedBucket("")).toBe(false);
    expect(isAllowedBucket("__proto__")).toBe(false);
    expect(isAllowedBucket("constructor")).toBe(false);
  });

  it("limit/window для бакетов фиксированы (клиент не задаёт их)", () => {
    expect(RATE_LIMIT_BUCKETS["booking:requests:org"]).toEqual({
      limit: 8,
      windowSeconds: 60,
    });
  });
});

describe("rate-limit identifier format", () => {
  it("реальный identifier из adapter проходит как SHA-256 hex", () => {
    expect(isSha256Hex(buildRateLimitIdentifier("1.2.3.4", "acme"))).toBe(true);
  });

  it("отвергает не-hex / неправильную длину / raw значения", () => {
    expect(isSha256Hex("not-a-hash")).toBe(false);
    expect(isSha256Hex("ABCDEF")).toBe(false); // uppercase
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex("a".repeat(65))).toBe(false);
    expect(isSha256Hex("1.2.3.4")).toBe(false); // raw IP
  });
});
