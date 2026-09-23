import type { NextConfig } from "next";

/**
 * Next.js Configuration.
 *
 * Security headers защищают от целых классов атак
 * на уровне HTTP-ответа. Браузер читает эти headers
 * и ограничивает поведение страницы.
 */
const securityHeaders = [
  {
    // Запрещает браузеру угадывать Content-Type.
    // Без этого: злоумышленник загружает файл с расширением .jpg,
    // но внутри — JavaScript. Браузер "угадывает" и исполняет.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Запрещает встраивание страницы в iframe.
    // Без этого: clickjacking — твоя страница в невидимом iframe,
    // пользователь кликает "Удалить" думая что нажимает "Лайк".
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Контролирует, какой URL отправляется при переходе на другой сайт.
    // strict-origin-when-cross-origin: отправляет только домен (не полный URL).
    // Без этого: URL /dashboard?token=secret123 виден третьим сайтам.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Отключает DNS prefetch для внешних ресурсов.
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@nevora/financial-state", "@nevora/finance-contracts", "@nevora/finance-api", "@nevora/finance-runtime", "@nevora/subscriptions-contracts", "@nevora/subscriptions-api", "@nevora/subscriptions-runtime", "@nevora/tasks-api", "@nevora/tasks-contracts", "@nevora/tasks-runtime"],
  redirects: async () => [
    {
      source: "/dashboard/tasks/:path*",
      destination: "/tasks/:path*",
      permanent: true,
    },
    {
      source: "/dashboard/money/:path*",
      destination: "/finance/:path*",
      permanent: true,
    },
    {
      source: "/dashboard/subscriptions/:path*",
      destination: "/subscriptions/:path*",
      permanent: true,
    },
    {
      source: "/dashboard/settings/:path*",
      destination: "/settings/:path*",
      permanent: true,
    },
  ],
  headers: async () => [
    {
      // Применяем headers ко ВСЕМ роутам
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
