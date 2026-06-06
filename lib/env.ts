import { z } from "zod";

/**
 * Валидация переменных окружения при старте приложения.
 *
 * Принцип Fail Fast:
 * Лучше упасть при запуске с понятной ошибкой "Missing NEXT_PUBLIC_SUPABASE_URL",
 * чем запуститься и сломаться на первом запросе пользователя
 * с "Cannot read properties of undefined".
 *
 * Zod валидирует:
 * - Переменная существует (.min(1))
 * - URL имеет правильный формат (.url())
 *
 * Если валидация провалится — приложение НЕ запустится,
 * а в консоли будет точный список отсутствующих переменных.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

/**
 * Парсим один раз при импорте модуля.
 * Если переменные не заданы — process.exit.
 */
function validateEnv() {
  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    console.error(
      "❌ Invalid environment variables:\n",
      result.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment variables. Check .env.local");
  }

  return result.data;
}

export const env = validateEnv();
