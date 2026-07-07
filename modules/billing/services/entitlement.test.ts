import { describe, it, expect } from "vitest";
import {
  parseTrialEligibilityV2,
  parseClaimTrialResult,
  parseAccessState,
  isWritableAccessState,
  isTrialAlreadyUsed,
} from "./entitlement";
import type { TrialEligibility } from "../types/entitlement.types";

describe("parseTrialEligibilityV2", () => {
  it("accepts the eligible/never_used shape", () => {
    expect(parseTrialEligibilityV2({ eligible: true, reason: "never_used" })).toEqual({
      eligible: true,
      reason: "never_used",
    });
  });

  it.each([
    "trial_claimed",
    "trial_already_used",
    "developer_unlimited",
    "verified_email_required",
    "auth_required",
  ])("passes through the known ineligible reason %s", (reason) => {
    expect(parseTrialEligibilityV2({ eligible: false, reason })).toEqual({
      eligible: false,
      reason,
    });
  });

  it("never reports eligible for an unknown reason", () => {
    expect(parseTrialEligibilityV2({ eligible: true, reason: "made_up" })).toEqual({
      eligible: false,
      reason: "trial_not_available",
    });
  });

  it.each([null, undefined, "string", 42, [], { reason: "never_used" }])(
    "fails closed on malformed payload %s",
    (raw) => {
      expect(parseTrialEligibilityV2(raw)).toEqual({
        eligible: false,
        reason: "trial_not_available",
      });
    },
  );
});

describe("parseClaimTrialResult", () => {
  it("parses a successful claim with access state", () => {
    expect(
      parseClaimTrialResult({ ok: true, reason: "trial_claimed", access_state: "trialing" }),
    ).toEqual({ ok: true, reason: "trial_claimed", accessState: "trialing" });
  });

  it("parses a denial without access state", () => {
    expect(parseClaimTrialResult({ ok: false, reason: "permission_denied" })).toEqual({
      ok: false,
      reason: "permission_denied",
    });
  });

  it("drops an unknown access_state but keeps the reason", () => {
    expect(
      parseClaimTrialResult({ ok: false, reason: "trial_already_used", access_state: "bogus" }),
    ).toEqual({ ok: false, reason: "trial_already_used" });
  });

  it("coerces a missing ok to false", () => {
    expect(parseClaimTrialResult({ reason: "internal_error" })).toEqual({
      ok: false,
      reason: "internal_error",
    });
  });

  it.each([null, undefined, "x", { ok: true }, { ok: true, reason: "nope" }])(
    "fails closed on malformed payload %s",
    (raw) => {
      expect(parseClaimTrialResult(raw)).toEqual({ ok: false, reason: "internal_error" });
    },
  );
});

describe("parseAccessState", () => {
  it.each([
    "trialing",
    "trial_expired",
    "paid_active",
    "developer_unlimited",
    "requires_paid_plan",
    "security_hold",
  ])("passes through known state %s", (state) => {
    expect(parseAccessState(state)).toBe(state);
  });

  it.each([null, undefined, "", "unknown", 3, {}])(
    "defaults to no_org for %s",
    (raw) => {
      expect(parseAccessState(raw)).toBe("no_org");
    },
  );
});

describe("isTrialAlreadyUsed", () => {
  it.each(["trial_claimed", "trial_already_used"] as const)(
    "is true for the used reason %s",
    (reason) => {
      expect(isTrialAlreadyUsed({ eligible: false, reason })).toBe(true);
    },
  );

  it("is false when eligible", () => {
    expect(isTrialAlreadyUsed({ eligible: true, reason: "never_used" })).toBe(false);
  });

  it.each([
    "developer_unlimited",
    "verified_email_required",
    "auth_required",
    "membership_required",
    "internal_error",
  ] as const)("is false for the non-used reason %s (no misleading message)", (reason) => {
    expect(isTrialAlreadyUsed({ eligible: false, reason } as TrialEligibility)).toBe(false);
  });
});

describe("isWritableAccessState", () => {
  it.each(["trialing", "paid_active", "payment_past_due", "developer_unlimited"] as const)(
    "%s is writable",
    (state) => {
      expect(isWritableAccessState(state)).toBe(true);
    },
  );

  it.each(["trial_expired", "requires_paid_plan", "canceled", "suspended", "no_org", "security_hold"] as const)(
    "%s is not writable",
    (state) => {
      expect(isWritableAccessState(state)).toBe(false);
    },
  );
});
