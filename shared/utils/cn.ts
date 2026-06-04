import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Объединяет Tailwind-классы с разрешением конфликтов.
 *
 * clsx — условно объединяет классы:
 *   cn("px-4", isActive && "bg-blue-500") → "px-4 bg-blue-500"
 *
 * twMerge — разрешает конфликты Tailwind:
 *   cn("bg-red-500", "bg-blue-500") → "bg-blue-500" (последний побеждает)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
