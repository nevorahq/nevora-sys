import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, InvalidTransitionError } from "./status-transitions";

describe("canTransition", () => {
  it("разрешает open → resolved/dismissed/snoozed/in_progress", () => {
    expect(canTransition("open", "resolved")).toBe(true);
    expect(canTransition("open", "dismissed")).toBe(true);
    expect(canTransition("open", "snoozed")).toBe(true);
    expect(canTransition("open", "in_progress")).toBe(true);
  });

  it("snoozed → open/resolved/dismissed", () => {
    expect(canTransition("snoozed", "open")).toBe(true);
    expect(canTransition("snoozed", "resolved")).toBe(true);
  });

  it("in_progress → resolved/failed/dismissed", () => {
    expect(canTransition("in_progress", "failed")).toBe(true);
    expect(canTransition("in_progress", "resolved")).toBe(true);
  });

  it("запрещает resolved → open без restore", () => {
    expect(canTransition("resolved", "open")).toBe(false);
  });

  it("запрещает dismissed → resolved", () => {
    expect(canTransition("dismissed", "resolved")).toBe(false);
  });

  it("запрещает cancelled → open", () => {
    expect(canTransition("cancelled", "open")).toBe(false);
  });

  it("restore разрешает resolved/dismissed → open", () => {
    expect(canTransition("resolved", "open", { restore: true })).toBe(true);
    expect(canTransition("dismissed", "open", { restore: true })).toBe(true);
    expect(canTransition("cancelled", "open", { restore: true })).toBe(false);
  });
});

describe("assertTransition", () => {
  it("бросает InvalidTransitionError на запрещённом переходе", () => {
    expect(() => assertTransition("resolved", "open")).toThrow(InvalidTransitionError);
  });
  it("не бросает на валидном", () => {
    expect(() => assertTransition("open", "resolved")).not.toThrow();
  });
});
