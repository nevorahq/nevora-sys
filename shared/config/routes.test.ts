import { existsSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { isMachineRoute, isPublicRoute, MACHINE_ROUTES, ROUTES } from "./routes";

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
    expect(isPublicRoute("/en")).toBe(true);
    expect(isPublicRoute("/ro")).toBe(true);
    expect(isPublicRoute("/ru")).toBe(true);
    expect(isPublicRoute("/pricing")).toBe(true);
    expect(isPublicRoute("/terms")).toBe(true);
    expect(isPublicRoute("/privacy")).toBe(true);
    expect(isPublicRoute("/refunds")).toBe(true);
    expect(isPublicRoute("/privasy")).toBe(true);
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

  it("машинные маршруты не считаются публичными", () => {
    // Прокси пропускает их отдельной проверкой; «публичность» тут ни при чём.
    for (const route of MACHINE_ROUTES) expect(isPublicRoute(route)).toBe(false);
  });

  it("пропускает cron и внутренние метрики", () => {
    expect(isMachineRoute("/api/cron/reminders")).toBe(true);
    expect(isMachineRoute("/api/cron/suggestions-sweep")).toBe(true);
    expect(isMachineRoute("/api/cron/purge-deleted-accounts")).toBe(true);
    expect(isMachineRoute("/api/internal/activation-funnel")).toBe(true);
    // drift guard: the purge machine route must exist on disk
    expect(existsSync("app/api/cron/purge-deleted-accounts/route.ts")).toBe(true);
  });

  it("пропускает webhook платёжного провайдера", () => {
    // Paddle POST'ит без сессии; без bypass прокси редиректит его на /login (307),
    // хендлер не бежит и платный план не активируется. Хендлер сам проверяет
    // HMAC-подпись, так что сессия ему не нужна.
    expect(isMachineRoute("/api/billing/webhook")).toBe(true);
    // и он не «публичный» — bypass делается отдельной проверкой isMachineRoute
    expect(isPublicRoute("/api/billing/webhook")).toBe(false);
    // drift guard: объявленный машинным путь должен существовать на диске
    expect(existsSync("app/api/billing/webhook/route.ts")).toBe(true);
  });

  it("сверяет только точное совпадение — префикс не открывает соседей", () => {
    expect(isMachineRoute("/api/cron")).toBe(false);
    expect(isMachineRoute("/api/cron/")).toBe(false);
    expect(isMachineRoute("/api/cron/reminders/secret")).toBe(false);
    expect(isMachineRoute("/api/internal/activation-funnel/raw")).toBe(false);
  });

  it("не открывает сессионные internal API", () => {
    expect(isMachineRoute("/api/internal/booking/availability-rules")).toBe(false);
    expect(isMachineRoute("/dashboard")).toBe(false);
  });

  /**
   * Drift guard: добавить папку в app/api/cron и забыть про MACHINE_ROUTES —
   * значит отгрузить cron, который всегда отвечает 302. Компилятор об этом не
   * скажет; этот тест скажет.
   */
  it("каждый существующий cron-роут объявлен машинным", () => {
    const cronDirs = readdirSync("app/api/cron", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/api/cron/${entry.name}`);

    expect(cronDirs.length).toBeGreaterThan(0);
    for (const route of cronDirs) expect(isMachineRoute(route)).toBe(true);
  });

  it("каждый объявленный машинный маршрут существует на диске", () => {
    // Обратная сторона: мёртвая запись в списке — это разрешение на путь,
    // которого никто не ревьюил.
    const cronRoutes = MACHINE_ROUTES.filter((route) => route.startsWith("/api/cron/"));
    const cronDirs = new Set(
      readdirSync("app/api/cron", { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `/api/cron/${entry.name}`),
    );

    for (const route of cronRoutes) expect(cronDirs.has(route)).toBe(true);
  });

  /**
   * Phase A: /dashboard IS the Action Center — the primary operating screen.
   * The generic metrics roll-up became secondary at /dashboard/overview.
   */
  it("Action Center is the dashboard; overview is secondary", () => {
    expect(ROUTES.dashboard).toBe("/dashboard");
    expect(ROUTES.actions).toBe(ROUTES.dashboard);
    expect(ROUTES.overview).toBe("/dashboard/overview");
  });

  it("legacy /dashboard/actions is not a public route (it 307s to /dashboard)", () => {
    // Persisted notification target_urls still point at the legacy path; it must
    // stay session-gated, not become an open redirect surface.
    expect(isPublicRoute("/dashboard/actions")).toBe(false);
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
