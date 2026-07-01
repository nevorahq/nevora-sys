import { describe, it, expect } from "vitest";
import { switchOrganizationSchema } from "./member.schemas";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

describe("switchOrganizationSchema", () => {
  it("accepts a valid organization UUID", () => {
    const r = switchOrganizationSchema.safeParse({ organizationId: ORG_ID });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID organization id", () => {
    const r = switchOrganizationSchema.safeParse({ organizationId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing organization id", () => {
    const r = switchOrganizationSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
