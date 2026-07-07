import { describe, expect, it } from "vitest";
import { parseTrialEligibility } from "./trial-eligibility";

describe("Trial Reuse Protection — parseTrialEligibility", () => {
  it("accepts the eligible never_used contract", () => {
    expect(parseTrialEligibility({ eligible: true, reason: "never_used" })).toEqual({
      eligible: true,
      reason: "never_used",
    });
  });

  it("accepts every ineligible reason from the contract", () => {
    for (const reason of [
      "trial_active",
      "trial_consumed",
      "trial_blocked",
      "billing_identity_already_used",
    ] as const) {
      expect(parseTrialEligibility({ eligible: false, reason })).toEqual({
        eligible: false,
        reason,
      });
    }
  });

  it("fails closed on malformed payloads — never grants a trial by accident", () => {
    const malformed: unknown[] = [
      null,
      undefined,
      "eligible",
      42,
      {},
      { eligible: true },
      { eligible: true, reason: "trial_active" },
      { eligible: "true", reason: "never_used" },
      { eligible: false, reason: "never_used" },
      { eligible: false, reason: "unknown_reason" },
    ];
    for (const raw of malformed) {
      expect(parseTrialEligibility(raw)).toEqual({ eligible: false, reason: "trial_blocked" });
    }
  });

  it("does not treat eligible=false + valid reason as eligible even with extra keys", () => {
    expect(
      parseTrialEligibility({ eligible: false, reason: "trial_consumed", extra: "ignored" }),
    ).toEqual({ eligible: false, reason: "trial_consumed" });
  });
});
