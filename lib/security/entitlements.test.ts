import { describe, expect, it } from "vitest";
import { evaluateEntitlement, canWriteInState, type AccessIntent } from "./entitlements";
import type { OrgAccessState } from "@/modules/billing/types/entitlement.types";

/**
 * The entitlement matrix is the pure heart of the policy engine — no I/O, so we
 * pin every state × intent decision here. Fail-closed is the contract: any
 * degraded state must never silently permit a `write`.
 */

const WRITE_STATES: OrgAccessState[] = [
  "trialing",
  "paid_active",
  "payment_past_due",
  "payment_grace",
  "developer_unlimited",
];

const NON_WRITE_STATES: OrgAccessState[] = [
  "trial_expired",
  "requires_paid_plan",
  "canceled",
  "payment_unpaid",
  "suspended",
  "security_hold",
  "no_org",
];

describe("evaluateEntitlement — write", () => {
  it.each(WRITE_STATES)("allows write in %s", (state) => {
    expect(evaluateEntitlement(state, "write").allowed).toBe(true);
    expect(canWriteInState(state)).toBe(true);
  });

  it.each(NON_WRITE_STATES)("denies write in %s", (state) => {
    const d = evaluateEntitlement(state, "write");
    expect(d.allowed).toBe(false);
    expect(d.code).toBeDefined();
    expect(canWriteInState(state)).toBe(false);
  });
});

describe("evaluateEntitlement — typed refusal codes", () => {
  it("maps trial_expired write → TRIAL_EXPIRED", () => {
    expect(evaluateEntitlement("trial_expired", "write").code).toBe("TRIAL_EXPIRED");
  });
  it("maps requires_paid_plan write → PLAN_REQUIRED", () => {
    expect(evaluateEntitlement("requires_paid_plan", "write").code).toBe("PLAN_REQUIRED");
  });
  it("maps canceled write → PLAN_REQUIRED", () => {
    expect(evaluateEntitlement("canceled", "write").code).toBe("PLAN_REQUIRED");
  });
  it("maps payment_unpaid write → PAYMENT_REQUIRED", () => {
    expect(evaluateEntitlement("payment_unpaid", "write").code).toBe("PAYMENT_REQUIRED");
  });
  it("maps suspended write → ORGANIZATION_SUSPENDED", () => {
    expect(evaluateEntitlement("suspended", "write").code).toBe("ORGANIZATION_SUSPENDED");
  });
  it("maps security_hold write → SECURITY_HOLD", () => {
    expect(evaluateEntitlement("security_hold", "write").code).toBe("SECURITY_HOLD");
  });
  it("maps no_org anything → ORG_REQUIRED", () => {
    expect(evaluateEntitlement("no_org", "write").code).toBe("ORG_REQUIRED");
  });
});

describe("evaluateEntitlement — invite freezes before writes", () => {
  it("past_due allows write but denies invite (PAYMENT_PAST_DUE)", () => {
    expect(evaluateEntitlement("payment_past_due", "write").allowed).toBe(true);
    const invite = evaluateEntitlement("payment_past_due", "invite");
    expect(invite.allowed).toBe(false);
    expect(invite.code).toBe("PAYMENT_PAST_DUE");
  });
  it("grace allows write but denies invite", () => {
    expect(evaluateEntitlement("payment_grace", "write").allowed).toBe(true);
    expect(evaluateEntitlement("payment_grace", "invite").allowed).toBe(false);
  });
});

describe("evaluateEntitlement — read/billing stay reachable", () => {
  const ALWAYS_READABLE: OrgAccessState[] = [
    "trial_expired",
    "requires_paid_plan",
    "canceled",
    "payment_unpaid",
    "suspended",
    "security_hold",
  ];
  it.each(ALWAYS_READABLE)("read + billing allowed in %s", (state) => {
    expect(evaluateEntitlement(state, "read").allowed).toBe(true);
    expect(evaluateEntitlement(state, "billing").allowed).toBe(true);
  });
  it("no_org denies even read", () => {
    expect(evaluateEntitlement("no_org", "read").allowed).toBe(false);
  });
});

describe("evaluateEntitlement — developer_unlimited", () => {
  const intents: AccessIntent[] = ["read", "write", "billing", "invite", "admin", "execute"];
  it.each(intents)("allows %s", (intent) => {
    expect(evaluateEntitlement("developer_unlimited", intent).allowed).toBe(true);
  });
});
