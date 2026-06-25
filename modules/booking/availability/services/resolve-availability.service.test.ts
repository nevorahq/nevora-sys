import { describe, it, expect, vi } from "vitest";
import {
  resolveAvailability,
  bookingOverlapsRange,
  type AvailabilityDataSource,
  type ResolvedHostService,
} from "./resolve-availability.service";
import type {
  AvailabilityRule,
  ExistingBooking,
  ServiceConfig,
} from "../types/availability.types";

/**
 * Тест route/service boundary публичной availability. Источник данных —
 * фейк, поэтому проверяем именно поведение endpoint'а:
 *   • активные правила загружаются и передаются в расчёт слотов;
 *   • без правил — пустой результат (нет fallback 08:00–18:00);
 *   • бронь, пересекающая границу диапазона, исключает слот.
 */

const DAY = "2026-06-15";
const DOW = new Date(`${DAY}T00:00:00Z`).getUTCDay();
const NOW = new Date("2026-06-01T00:00:00Z");

const SERVICE: ServiceConfig = {
  duration_minutes: 60,
  slot_interval_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  booking_window_days: 365,
};

const HOST: ResolvedHostService = { hostId: "host-1", service: SERVICE };

function rule(start: string, end: string): AvailabilityRule {
  return { day_of_week: DOW, start_time: start, end_time: end };
}

function makeSource(overrides: {
  hostService?: ResolvedHostService | null;
  rules?: AvailabilityRule[];
  bookings?: ExistingBooking[];
}): AvailabilityDataSource {
  return {
    getHostService: vi
      .fn()
      .mockResolvedValue(
        overrides.hostService === undefined ? HOST : overrides.hostService,
      ),
    getActiveRules: vi.fn().mockResolvedValue(overrides.rules ?? []),
    getConflictingBookings: vi.fn().mockResolvedValue(overrides.bookings ?? []),
    getBlackouts: vi.fn().mockResolvedValue([]),
  };
}

const QUERY = {
  organizationSlug: "acme",
  hostSlug: "ion",
  serviceSlug: "consult",
  start: DAY,
  end: DAY,
  timeZone: "UTC",
};

describe("resolveAvailability", () => {
  it("передаёт активные правила в расчёт → слоты построены из них", async () => {
    const source = makeSource({ rules: [rule("09:00:00", "12:00:00")] });

    const result = await resolveAvailability(source, QUERY, NOW);

    expect(source.getActiveRules).toHaveBeenCalledWith("host-1");
    expect(result[DAY]?.map((s) => s.start)).toEqual([
      "2026-06-15T09:00:00.000Z",
      "2026-06-15T10:00:00.000Z",
      "2026-06-15T11:00:00.000Z",
    ]);
  });

  it("нет активных правил → пустой результат (никакого fallback)", async () => {
    const source = makeSource({ rules: [] });

    const result = await resolveAvailability(source, QUERY, NOW);

    expect(Object.keys(result)).toHaveLength(0);
    // Без правил даже не ходим за бронями.
    expect(source.getConflictingBookings).not.toHaveBeenCalled();
  });

  it("host/service не найден → пустой результат", async () => {
    const source = makeSource({ hostService: null });
    const result = await resolveAvailability(source, QUERY, NOW);
    expect(Object.keys(result)).toHaveLength(0);
    expect(source.getActiveRules).not.toHaveBeenCalled();
  });

  it("бронь, начавшаяся ДО start (пересекает нижнюю границу), исключает слот", async () => {
    // Бронь стартует накануне (2026-06-14T23:00Z) и тянется до 09:30Z 15-го —
    // прежняя containment-выборка её бы не вернула. Здесь источник её отдаёт
    // (как исправленная overlap-выборка) → слот 09:00 должен исчезнуть.
    const crossingBooking: ExistingBooking = {
      requested_start_at: "2026-06-14T23:00:00.000Z",
      requested_end_at: "2026-06-15T09:30:00.000Z",
    };

    const source = makeSource({
      rules: [rule("09:00:00", "12:00:00")],
      bookings: [crossingBooking],
    });

    const result = await resolveAvailability(source, QUERY, NOW);
    const starts = result[DAY]?.map((s) => s.start) ?? [];

    expect(starts).not.toContain("2026-06-15T09:00:00.000Z");
    expect(starts).toEqual([
      "2026-06-15T10:00:00.000Z",
      "2026-06-15T11:00:00.000Z",
    ]);
  });
});

describe("bookingOverlapsRange (семантика overlap-выборки)", () => {
  const rangeStart = new Date("2026-06-15T00:00:00.000Z");
  const rangeEnd = new Date("2026-06-15T23:59:59.000Z");

  it("бронь целиком до диапазона → не конфликтует", () => {
    expect(
      bookingOverlapsRange(
        { requested_start_at: "2026-06-14T08:00:00Z", requested_end_at: "2026-06-14T09:00:00Z" },
        rangeStart,
        rangeEnd,
      ),
    ).toBe(false);
  });

  it("бронь пересекает НИЖНЮЮ границу (старт раньше start) → конфликтует", () => {
    // Регрессия: старая логика start>=rangeStart исключала такие брони.
    expect(
      bookingOverlapsRange(
        { requested_start_at: "2026-06-14T23:30:00Z", requested_end_at: "2026-06-15T00:30:00Z" },
        rangeStart,
        rangeEnd,
      ),
    ).toBe(true);
  });

  it("бронь пересекает ВЕРХНЮЮ границу (конец позже end) → конфликтует", () => {
    expect(
      bookingOverlapsRange(
        { requested_start_at: "2026-06-15T23:30:00Z", requested_end_at: "2026-06-16T00:30:00Z" },
        rangeStart,
        rangeEnd,
      ),
    ).toBe(true);
  });

  it("бронь целиком после диапазона → не конфликтует", () => {
    expect(
      bookingOverlapsRange(
        { requested_start_at: "2026-06-16T08:00:00Z", requested_end_at: "2026-06-16T09:00:00Z" },
        rangeStart,
        rangeEnd,
      ),
    ).toBe(false);
  });
});
