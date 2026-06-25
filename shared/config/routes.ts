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
  login: "/login",
  register: "/register",

  // Onboarding — создание организации после регистрации
  onboarding: "/onboarding",

  // Dashboard
  dashboard: "/dashboard",
  actions: "/dashboard/actions",
  tasks: "/dashboard/tasks",
  crm: "/dashboard/crm",
  money: "/dashboard/money",
  subscriptions: "/dashboard/subscriptions",
  documents:  "/dashboard/documents",
  documentsNew: "/dashboard/documents/new",
  analytics:  "/dashboard/analytics",
  ai:         "/dashboard/ai",
  billing:    "/dashboard/billing",
  members:    "/dashboard/settings/members",

  // Booking — internal dashboard
  booking:              "/dashboard/booking",
  bookingRequests:      "/dashboard/booking/requests",
  bookingHosts:         "/dashboard/booking/hosts",
  bookingServices:      "/dashboard/booking/services",
  bookingAvailability:  "/dashboard/booking/availability",

  // Ops — health check для load balancer / monitoring (без сессии).
  health: "/api/health",
} as const;

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
 * Пути, доступные авторизованным пользователям БЕЗ организации.
 * Пользователь с org не может зайти на эти пути (редирект на dashboard).
 */
export const ONBOARDING_ROUTES = [
  ROUTES.onboarding,
] as const;
