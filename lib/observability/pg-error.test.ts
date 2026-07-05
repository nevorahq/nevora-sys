import { describe, it, expect } from "vitest";
import { describePgError } from "./pg-error";

describe("describePgError", () => {
  it("extracts PostgREST error fields into a plain, serializable object", () => {
    // A PostgrestError is an Error subclass with non-enumerable message — the
    // exact shape that used to serialize to `{}` in logs.
    const err = Object.assign(new Error("record \"old\" has no field \"revoked_at\""), {
      code: "42703",
      details: null,
      hint: null,
    });
    const info = describePgError(err);
    expect(info.code).toBe("42703");
    expect(info.message).toContain("revoked_at");
    // The whole point: JSON.stringify must now show the fields, not `{}`.
    expect(JSON.stringify(info)).not.toBe("{}");
    expect(JSON.stringify(info)).toContain("42703");
  });

  it("handles a plain Error (non-enumerable message)", () => {
    const info = describePgError(new Error("boom"));
    expect(info.message).toBe("boom");
  });

  it("handles strings, null and non-objects", () => {
    expect(describePgError("bad")).toEqual({ message: "bad" });
    expect(describePgError(null)).toEqual({});
    expect(describePgError(undefined)).toEqual({});
    expect(describePgError(42)).toEqual({ message: "42" });
  });

  it("keeps only string fields (ignores nulls from PostgREST)", () => {
    const info = describePgError({ code: "P0002", message: "not found", details: null, hint: null });
    expect(info).toEqual({ code: "P0002", message: "not found" });
  });
});
