/**
 * Централизованные пути приложения.
 *
 * Зачем: если путь захардкожен в 15 файлах и ты его переименуешь,
 * нужно менять в 15 местах. Здесь — меняешь в одном.
 * TypeScript подскажет, если используешь несуществующий путь.
 */
export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
} as const;

/**
 * Пути, доступные без аутентификации.
 * Middleware будет использовать этот список.
 */
export const PUBLIC_ROUTES = [
  ROUTES.home,
  ROUTES.login,
  ROUTES.register,
] as const;
