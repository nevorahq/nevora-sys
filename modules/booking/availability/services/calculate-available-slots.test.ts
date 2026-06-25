import { describe, it, expect } from "vitest";
import { calculateAvailableSlots } from "./calculate-available-slots.service";
import type {
  AvailabilityRule,
  ServiceConfig,
} from "../types/availability.types";

/**
 * Тесты расчёта доступных слотов — основа публичного booking availability.
 * Считаем в UTC, чтобы рассуждать о времени без сюрпризов DST.
 */

// Фиксированная дата в будущем; её день недели вычисляем динамически,
// чтобы тест не зависел от конкретного календарного дня.
const DAY = "2026-06-15";
const DOW = new Date(`${DAY}T00:00:00Z`).getUTCDay();
const TZ = "UTC";

// `now` сильно раньше DAY → minimum_notice не отбрасывает слоты.
const NOW = new Date("2026-06-01T00:00:00Z");

const SERVICE: ServiceConfig = {
  duration_minutes: 60,
  slot_interval_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  booking_window_days: 365,
};

function rule(dayOfWeek: number, start: string, end: string): AvailabilityRule {
  return { day_of_week: dayOfWeek, start_time: start, end_time: end };
}

describe("calculateAvailableSlots", () => {
  it("ограниченный рабочий интервал → только помещающиеся слоты", () => {
    const result = calculateAvailableSlots({
      startDate: DAY,
      endDate: DAY,
      timeZone: TZ,
      rules: [rule(DOW, "09:00:00", "12:00:00")],
      blackouts: [],
      existingBookings: [],
      service: SERVICE,
      now: NOW,
    });

    // 09-10, 10-11, 11-12 → три слота; 12-13 выходит за конец дня.
    expect(result[DAY]).toBeDefined();
    expect(result[DAY].map((s) => s.start)).toEqual([
      "2026-06-15T09:00:00.000Z",
      "2026-06-15T10:00:00.000Z",
      "2026-06-15T11:00:00.000Z",
    ]);
  });

  it("выключенный день (нет правила на этот день недели) → нет слотов", () => {
    const result = calculateAvailableSlots({
      startDate: DAY,
      endDate: DAY,
      timeZone: TZ,
      // Правило только на ДРУГОЙ день недели → запрошенный день закрыт.
      rules: [rule((DOW + 1) % 7, "09:00:00", "18:00:00")],
      blackouts: [],
      existingBookings: [],
      service: SERVICE,
      now: NOW,
    });

    expect(result[DAY]).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("отсутствующие правила → нет слотов (никакого fallback 08:00–18:00)", () => {
    const result = calculateAvailableSlots({
      startDate: DAY,
      endDate: DAY,
      timeZone: TZ,
      rules: [],
      blackouts: [],
      existingBookings: [],
      service: SERVICE,
      now: NOW,
    });

    expect(Object.keys(result)).toHaveLength(0);
  });

  it("пересечение с существующим booking → занятый слот исключён", () => {
    const result = calculateAvailableSlots({
      startDate: DAY,
      endDate: DAY,
      timeZone: TZ,
      rules: [rule(DOW, "09:00:00", "12:00:00")],
      blackouts: [],
      existingBookings: [
        {
          requested_start_at: "2026-06-15T10:00:00.000Z",
          requested_end_at: "2026-06-15T11:00:00.000Z",
        },
      ],
      service: SERVICE,
      now: NOW,
    });

    const starts = result[DAY]?.map((s) => s.start) ?? [];
    expect(starts).toEqual([
      "2026-06-15T09:00:00.000Z",
      "2026-06-15T11:00:00.000Z",
    ]);
    expect(starts).not.toContain("2026-06-15T10:00:00.000Z");
  });
});
