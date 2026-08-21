import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Лёгкий тестовый стек для Next 16 / React 19.
 *
 * Тесты — это чистая бизнес-логика (расчёт слотов, permission-решения,
 * public-route matching), поэтому окружение node без JSDOM. `@/*` алиас
 * зеркалит tsconfig, чтобы импорты вида "@/shared/..." работали.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@nevora/financial-state": fileURLToPath(new URL("./packages/financial-state/src", import.meta.url)),
      "@nevora/tasks-api": fileURLToPath(new URL("./packages/tasks-api/src/index.ts", import.meta.url)),
      "@nevora/tasks-contracts": fileURLToPath(new URL("./packages/tasks-contracts/src/index.ts", import.meta.url)),
      "@nevora/tasks-runtime": fileURLToPath(new URL("./packages/tasks-runtime/src/index.ts", import.meta.url)),
      // `server-only` is a Next.js build guard with no runtime; stub it for node tests.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
