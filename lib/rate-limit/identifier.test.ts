import { describe, it, expect } from "vitest";
import { buildRateLimitIdentifier } from "./identifier";

describe("buildRateLimitIdentifier", () => {
  it("детерминирован для одинаковых входных данных", () => {
    expect(buildRateLimitIdentifier("1.2.3.4", "acme")).toBe(
      buildRateLimitIdentifier("1.2.3.4", "acme"),
    );
  });

  it("разный IP → разный идентификатор", () => {
    expect(buildRateLimitIdentifier("1.2.3.4", "acme")).not.toBe(
      buildRateLimitIdentifier("5.6.7.8", "acme"),
    );
  });

  it("разный scope → разный идентификатор (изоляция между орг.)", () => {
    expect(buildRateLimitIdentifier("1.2.3.4", "acme")).not.toBe(
      buildRateLimitIdentifier("1.2.3.4", "globex"),
    );
  });

  it("не раскрывает сырой IP (хэш 64 hex-символа)", () => {
    const id = buildRateLimitIdentifier("1.2.3.4", "acme");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain("1.2.3.4");
  });
});
