import { describe, it, expect } from "vitest";
import { resolveActiveOrganizationId, type MembershipRecord } from "./resolve-active-organization";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ORG_C = "33333333-3333-4333-8333-333333333333";

function membership(partial: Partial<MembershipRecord>): MembershipRecord {
  return {
    organizationId: ORG_A,
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("resolveActiveOrganizationId", () => {
  it("resolves the selected organization when the user has an active membership in it", () => {
    const memberships = [
      membership({ organizationId: ORG_A, createdAt: "2026-01-01T00:00:00Z" }),
      membership({ organizationId: ORG_B, createdAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(resolveActiveOrganizationId(memberships, ORG_B)).toBe(ORG_B);
  });

  it("falls back to the oldest active membership when the selected org does not belong to the user", () => {
    const memberships = [
      membership({ organizationId: ORG_A, createdAt: "2026-01-01T00:00:00Z" }),
      membership({ organizationId: ORG_B, createdAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(resolveActiveOrganizationId(memberships, ORG_C)).toBe(ORG_A);
  });

  it("falls back when the selected membership exists but is only invited, not active", () => {
    const memberships = [
      membership({ organizationId: ORG_A, status: "active", createdAt: "2026-01-01T00:00:00Z" }),
      membership({ organizationId: ORG_B, status: "invited", createdAt: "2026-01-15T00:00:00Z" }),
    ];
    expect(resolveActiveOrganizationId(memberships, ORG_B)).toBe(ORG_A);
  });

  it("falls back when the selected membership is suspended", () => {
    const memberships = [
      membership({ organizationId: ORG_A, status: "active", createdAt: "2026-01-01T00:00:00Z" }),
      membership({ organizationId: ORG_B, status: "suspended", createdAt: "2026-01-15T00:00:00Z" }),
    ];
    expect(resolveActiveOrganizationId(memberships, ORG_B)).toBe(ORG_A);
  });

  it("falls back deterministically to the oldest active membership when no organization is selected", () => {
    const memberships = [
      membership({ organizationId: ORG_B, createdAt: "2026-02-01T00:00:00Z" }),
      membership({ organizationId: ORG_A, createdAt: "2026-01-01T00:00:00Z" }),
      membership({ organizationId: ORG_C, createdAt: "2026-03-01T00:00:00Z" }),
    ];
    expect(resolveActiveOrganizationId(memberships, null)).toBe(ORG_A);
    expect(resolveActiveOrganizationId(memberships, undefined)).toBe(ORG_A);
  });

  it("handles a user with exactly one active organization the same regardless of selection", () => {
    const memberships = [membership({ organizationId: ORG_A, createdAt: "2026-01-01T00:00:00Z" })];
    expect(resolveActiveOrganizationId(memberships, null)).toBe(ORG_A);
    expect(resolveActiveOrganizationId(memberships, ORG_A)).toBe(ORG_A);
    expect(resolveActiveOrganizationId(memberships, ORG_C)).toBe(ORG_A);
  });

  it("returns null when the user has no active organizations at all", () => {
    expect(resolveActiveOrganizationId([], null)).toBeNull();
    const onlyInvited = [membership({ organizationId: ORG_A, status: "invited" })];
    expect(resolveActiveOrganizationId(onlyInvited, ORG_A)).toBeNull();
  });
});
