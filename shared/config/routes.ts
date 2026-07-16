/**
 * Централизованные пути приложения.
 *
 * Зачем: если путь захардкожен в 15 файлах и ты его переименуешь,
 * нужно менять в 15 местах. Здесь — меняешь в одном.
 * TypeScript подскажет, если используешь несуществующий путь.
 *
 * Структура:
 * - platform routes: /, /login, /register
 * - dashboard routes: /dashboard, /dashboard/tasks, /dashboard/money
 */
export const ROUTES = {
  // Platform
  home: "/",
  landingEn: "/en",
  landingRo: "/ro",
  landingRu: "/ru",
  pricing: "/pricing",
  terms: "/terms",
  privacy: "/privacy",
  refunds: "/refunds",
  privacyTypo: "/privasy",
  login: "/login",
  register: "/register",

  // Onboarding — создание организации после регистрации
  onboarding: "/onboarding",

  // Dashboard
  //
  // `/dashboard` IS the Action Center — the primary operating screen, answering
  // "what needs my attention today?". The generic metrics overview is secondary
  // and lives at `/dashboard/overview`.
  dashboard: "/dashboard",
  /**
   * Alias for the Action Center surface. Kept as its own key because ~15 call
   * sites revalidate it *semantically* ("an action item changed"), not because
   * they mean "the dashboard". Points at `/dashboard` since the two merged.
   * The legacy `/dashboard/actions` path still resolves — it 307s here, so old
   * bookmarks and `target_url`s already persisted in `notifications` keep working.
   */
  actions: "/dashboard",
  /** Secondary: cross-module metrics roll-up (tasks / money / subscriptions). */
  overview: "/dashboard/overview",
  inbox: "/dashboard/inbox",
  /**
   * Post-auth landing screen ("home"). Single source of truth for where a
   * signed-in user lands (login / register / invite-accept / already-authed on
   * /login). Currently the Inbox: the Action Center is hidden from the primary
   * nav, so the Inbox is the day-to-day entry point. Change here, not at each
   * redirect site. (`home` is the PUBLIC root `/`; this is the signed-in landing.)
   */
  appHome: "/dashboard/inbox",
  tasks: "/dashboard/tasks",
  tasksFinancial: "/dashboard/tasks/financial",
  projects: "/dashboard/tasks/projects",
  crm: "/dashboard/crm",
  money: "/dashboard/money",
  subscriptions: "/dashboard/subscriptions",
  documents:  "/dashboard/documents",
  documentsNew: "/dashboard/documents/new",
  analytics:  "/dashboard/analytics",
  ai:         "/dashboard/ai",
  settings:          "/dashboard/settings",
  settingsProfile:   "/dashboard/settings/profile",
  settingsNotifications: "/dashboard/settings/notifications",
  settingsWorkspace: "/dashboard/settings/workspace",
  settingsMembers:   "/dashboard/settings/members",
  settingsBilling:   "/dashboard/settings/billing",
  settingsPlans:     "/dashboard/settings/plans",
  settingsDeveloper: "/dashboard/settings/developer",
  // Compatibility aliases for existing domain modules and links.
  billing:            "/dashboard/settings/billing",
  members:            "/dashboard/settings/members",

  // Booking — internal dashboard
  booking:              "/dashboard/booking",
  bookingRequests:      "/dashboard/booking/requests",
  bookingHosts:         "/dashboard/booking/hosts",
  bookingServices:      "/dashboard/booking/services",
  bookingAvailability:  "/dashboard/booking/availability",

  // Ops — health check для load balancer / monitoring (без сессии).
  health: "/api/health",
} as const;

/** URL детальной страницы проекта. */
export function projectDetailUrl(projectId: string) {
  return `/dashboard/tasks/projects/${projectId}`;
}

/** Публичный URL страницы бронирования организации. */
export function bookingPageUrl(organizationSlug: string) {
  return `/booking/${organizationSlug}`;
}

/** Публичный URL профиля хоста. */
export function bookingHostUrl(organizationSlug: string, hostSlug: string) {
  return `/booking/${organizationSlug}/${hostSlug}`;
}

/**
 * Пути, доступные без аутентификации (точное совпадение).
 *
 * /api/health включён точечно: monitoring и load balancer должны получать
 * 200/503 напрямую, а не redirect на /login. Никакие другие internal API
 * сюда НЕ добавляются.
 */
export const PUBLIC_ROUTES = [
  ROUTES.home,
  ROUTES.landingEn,
  ROUTES.landingRo,
  ROUTES.landingRu,
  ROUTES.pricing,
  ROUTES.terms,
  ROUTES.privacy,
  ROUTES.refunds,
  ROUTES.privacyTypo,
  ROUTES.login,
  ROUTES.register,
  ROUTES.health,
] as const;

/** Публичный URL приёма приглашения по токену. */
export function inviteUrl(token: string) {
  return `/invite/${token}`;
}

/** Префиксы публичных путей (проверяется через startsWith). */
export const PUBLIC_PREFIXES = [
  "/booking/",
  "/api/public/",
  "/api/v1/",
  "/invite/",
] as const;

/**
 * Является ли путь публичным (без обязательной сессии).
 *
 * Точное совпадение по PUBLIC_ROUTES ИЛИ префикс из PUBLIC_PREFIXES.
 * Выделено в чистую функцию, чтобы покрыть тестами логику proxy.
 */
export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.some((route) => pathname === route) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Машинные маршруты: сессии Supabase у них нет и быть не может — их вызывает
 * планировщик (Vercel Cron), внешний провайдер (Paddle webhook) или внутренний
 * скрипт. Прокси обязан их пропускать: редирект на /login превращает вызов в 302
 * и он молча не выполняется (cron-sweep не бежит, webhook Paddle теряется —
 * платный план так и не активируется).
 *
 * Это НЕ «публичные» пути. Каждый такой handler аутентифицирует себя сам —
 * cron/internal по shared secret, webhook по HMAC-подписи — и падает закрыто:
 * 503 без секрета, 401 при несовпадении. Прокси не проверяет их лишь потому,
 * что проверять у них нечего.
 *
 * Сверка ТОЛЬКО по точному совпадению, без префиксов. Префикс `/api/cron/` сделал
 * бы каждый новый файл в этой папке бессессионным в момент создания. Здесь путь
 * приходится вписать руками — то есть осознанно и через ревью.
 */
export const MACHINE_ROUTES = [
  "/api/cron/extraction-sweep",
  "/api/cron/suggestions-sweep",
  "/api/cron/reminders",
  "/api/cron/subscription-sweep",
  "/api/cron/trial-sweep",
  "/api/cron/purge-deleted-accounts",
  "/api/internal/activation-funnel",
  "/api/billing/webhook",
] as const;

export function isMachineRoute(pathname: string): boolean {
  return MACHINE_ROUTES.some((route) => pathname === route);
}

/**
 * Пути, доступные авторизованным пользователям БЕЗ организации.
 * Пользователь с org не может зайти на эти пути (редирект на dashboard).
 */
export const ONBOARDING_ROUTES = [
  ROUTES.onboarding,
] as const;
