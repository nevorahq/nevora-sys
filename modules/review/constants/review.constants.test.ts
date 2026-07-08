import { describe, expect, it } from "vitest";
import {
  InvalidReviewTransitionError,
  assertReviewStateTransition,
  canTransitionReviewState,
} from "./review.constants";

describe("review state lifecycle", () => {
  it("allows the supported Phase C review progression", () => {
    expect(canTransitionReviewState("detected", "suggested")).toBe(true);
    expect(canTransitionReviewState("suggested", "waiting_confirmation")).toBe(true);
    expect(canTransitionReviewState("waiting_confirmation", "confirmed")).toBe(true);
    expect(canTransitionReviewState("waiting_confirmation", "rejected")).toBe(true);
    expect(canTransitionReviewState("suggested", "rejected")).toBe(true);
  });

  it("rejects terminal reversals and skipped confirmations", () => {
    expect(canTransitionReviewState("detected", "confirmed")).toBe(false);
    expect(canTransitionReviewState("confirmed", "waiting_confirmation")).toBe(false);
    expect(canTransitionReviewState("rejected", "confirmed")).toBe(false);
    expect(() => assertReviewStateTransition("detected", "confirmed")).toThrow(InvalidReviewTransitionError);
  });
});
