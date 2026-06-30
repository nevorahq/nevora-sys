import { describe, it, expect } from "vitest";
import { isPublicRoute, ROUTES } from "./routes";

/**
 * Логика proxy: какие пути доступны без сессии. Регрессия по этому набору
 * напрямую влияет на безопасность (открытые internal API) и на health-check
 * (monitoring/load balancer не должен получать redirect на /login).
 */
describe("isPublicRoute", () => {
  it("health endpoint доступен без сессии (точное совпадение)", () => {
    expect(isPublicRoute("/api/health")).toBe(true);
  });

  it("платформенные публичные пути доступны", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/register")).toBe(true);
  });

  it("публичные booking / invite префиксы доступны", () => {
    expect(isPublicRoute("/booking/acme")).toBe(true);
    expect(isPublicRoute("/booking/acme/ion-popescu")).toBe(true);
    expect(isPublicRoute("/api/public/booking/requests")).toBe(true);
    expect(isPublicRoute("/invite/some-token")).toBe(true);
  });

  it("internal API НЕ открыты health-исключением", () => {
    expect(isPublicRoute("/api/internal/booking/availability-rules")).toBe(false);
    // health публичен только как точный путь, не как префикс.
    expect(isPublicRoute("/api/health/secret")).toBe(false);
    expect(isPublicRoute("/api/healthz")).toBe(false);
  });

  it("защищённые пути требуют сессию", () => {
    expect(isPublicRoute("/dashboard")).toBe(false);
    expect(isPublicRoute("/dashboard/crm")).toBe(false);
  });

  it("Settings owns profile, workspace, members, and billing routes", () => {
    expect(ROUTES.settingsProfile).toBe("/dashboard/settings/profile");
    expect(ROUTES.settingsWorkspace).toBe("/dashboard/settings/workspace");
    expect(ROUTES.settingsMembers).toBe("/dashboard/settings/members");
    expect(ROUTES.settingsBilling).toBe("/dashboard/settings/billing");
    expect(ROUTES.members).toBe(ROUTES.settingsMembers);
    expect(ROUTES.billing).toBe(ROUTES.settingsBilling);
  });
});
