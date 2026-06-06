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

  // Dashboard
  dashboard: "/dashboard",
  tasks: "/dashboard/tasks",
  money: "/dashboard/money",
  subscriptions: "/dashboard/subscriptions",
} as const;

/**
 * Пути, доступные без аутентификации.
 * Proxy будет использовать этот список.
 */
export const PUBLIC_ROUTES = [
  ROUTES.home,
  ROUTES.login,
  ROUTES.register,
] as const;
