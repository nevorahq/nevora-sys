import { describe, expect, it } from "vitest";
import { resolveDueDateChange } from "./resolve-due-date-change";

describe("resolveDueDateChange", () => {
  it("returns 'set' when there was no previous due date", () => {
    expect(resolveDueDateChange(null, "2026-07-10")).toBe("set");
  });

  it("returns 'extended' when the new date is later", () => {
    expect(resolveDueDateChange("2026-07-10", "2026-07-20")).toBe("extended");
  });

  it("returns 'shortened' when the new date is earlier", () => {
    expect(resolveDueDateChange("2026-07-10", "2026-07-01")).toBe("shortened");
  });

  it("returns null when the date is unchanged (no-op)", () => {
    expect(resolveDueDateChange("2026-07-10", "2026-07-10")).toBeNull();
  });

  it("compares calendar order across month/year boundaries", () => {
    expect(resolveDueDateChange("2026-12-31", "2027-01-01")).toBe("extended");
    expect(resolveDueDateChange("2027-01-01", "2026-12-31")).toBe("shortened");
  });
});
