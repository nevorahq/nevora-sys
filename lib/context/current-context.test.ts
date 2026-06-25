import { describe, it, expect } from "vitest";
import { isOwner, isAdmin, canDo, type CurrentContext } from "./current-context";

/**
 * Критичные permission-решения. Роли в БД (memberships.role) — lowercase.
 * Эти тесты ловят регрессию, когда helper'ы сравнивали с Title Case
 * ("Owner"/"Admin") и поэтому всегда возвращали false.
 */
function ctxWithRole(name: string, isSystem = true): CurrentContext {
  return {
    role: { id: name, name, isSystem, organizationId: "org-1" },
    permissions: new Set<string>(),
  } as unknown as CurrentContext;
}

describe("isOwner", () => {
  it("true для системной роли owner (lowercase)", () => {
    expect(isOwner(ctxWithRole("owner"))).toBe(true);
  });

  it("false для admin/member", () => {
    expect(isOwner(ctxWithRole("admin"))).toBe(false);
    expect(isOwner(ctxWithRole("member"))).toBe(false);
  });

  it("регрессия: Title Case 'Owner' НЕ считается owner", () => {
    expect(isOwner(ctxWithRole("Owner"))).toBe(false);
  });

  it("false если роль не системная", () => {
    expect(isOwner(ctxWithRole("owner", false))).toBe(false);
  });
});

describe("isAdmin", () => {
  it("true для owner и admin", () => {
    expect(isAdmin(ctxWithRole("owner"))).toBe(true);
    expect(isAdmin(ctxWithRole("admin"))).toBe(true);
  });

  it("false для manager/member", () => {
    expect(isAdmin(ctxWithRole("manager"))).toBe(false);
    expect(isAdmin(ctxWithRole("member"))).toBe(false);
  });

  it("регрессия: Title Case 'Admin' НЕ считается admin", () => {
    expect(isAdmin(ctxWithRole("Admin"))).toBe(false);
  });
});

describe("canDo", () => {
  it("проверяет наличие permission в множестве", () => {
    const ctx = {
      permissions: new Set<string>(["todos.write"]),
    } as unknown as CurrentContext;
    expect(canDo(ctx, "todos.write")).toBe(true);
    expect(canDo(ctx, "todos.delete")).toBe(false);
  });
});
