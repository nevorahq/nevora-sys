import type { AvailabilityByDate } from "../types/availability.types";

/**
 * Извлекает список дат с хотя бы одним доступным слотом.
 * Используется для подсветки доступных дней в календаре.
 */
export function getAvailableDays(availability: AvailabilityByDate): string[] {
  return Object.keys(availability).filter(
    (date) => (availability[date]?.length ?? 0) > 0,
  );
}
