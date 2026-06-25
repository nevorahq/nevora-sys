import { describe, it, expect } from "vitest";
import {
  createAutomationLogSchema,
  getAutomationLogsSchema,
} from "./automation-log.schema";

const ORG = "11111111-1111-4111-8111-111111111111";
const EVT = "22222222-2222-4222-8222-222222222222";

describe("createAutomationLogSchema", () => {
  const base = {
    organizationId: ORG,
    automationName: "on-document-created",
    automationEvent: "document.created",
    triggerEventId: EVT,
    status: "executed" as const,
  };

  it("принимает валидный лог", () => {
    expect(createAutomationLogSchema.safeParse(base).success).toBe(true);
  });

  it("проставляет пустые payload по умолчанию", () => {
    const r = createAutomationLogSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inputPayload).toEqual({});
      expect(r.data.outputPayload).toEqual({});
    }
  });

  it("отклоняет недопустимый status", () => {
    const r = createAutomationLogSchema.safeParse({ ...base, status: "boom" });
    expect(r.success).toBe(false);
  });

  it("отклоняет oversized payload (>16KB)", () => {
    const big = { blob: "x".repeat(20_000) };
    const r = createAutomationLogSchema.safeParse({ ...base, inputPayload: big });
    expect(r.success).toBe(false);
  });

  it("требует organizationId-UUID", () => {
    const r = createAutomationLogSchema.safeParse({ ...base, organizationId: "nope" });
    expect(r.success).toBe(false);
  });
});

describe("getAutomationLogsSchema", () => {
  it("limit по умолчанию = 50", () => {
    const r = getAutomationLogsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it("отклоняет limit > 200", () => {
    expect(getAutomationLogsSchema.safeParse({ limit: 999 }).success).toBe(false);
  });
});
