import { describe, expect, it } from "vitest";
import {
  deletePlannerEntrySchema,
  updatePlannerEntrySchema,
} from "./planner-entry.schema";

const entryId = "11111111-1111-4111-8111-111111111111";

describe("planner entry schemas", () => {
  it("accepts a valid entry update", () => {
    const result = updatePlannerEntrySchema.safeParse({
      entryId,
      rawText: "  Update capture text  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawText).toBe("Update capture text");
    }
  });

  it("rejects empty update text", () => {
    expect(updatePlannerEntrySchema.safeParse({ entryId, rawText: "   " }).success).toBe(false);
  });

  it("requires a valid id for delete", () => {
    expect(deletePlannerEntrySchema.safeParse({ entryId: "nope" }).success).toBe(false);
    expect(deletePlannerEntrySchema.safeParse({ entryId }).success).toBe(true);
  });
});
