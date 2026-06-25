import { calculateAvailableSlots } from "./calculate-available-slots.service";
import type {
  AvailabilityByDate,
  AvailabilityRule,
  BlackoutPeriod,
  ExistingBooking,
  ServiceConfig,
} from "../types/availability.types";

/**
 * Оркестрация публичной availability, отделённая от Supabase ради
 * тестируемости route/service boundary. Источник данных инъектируется
 * (AvailabilityDataSource), поэтому в тестах можно подменить его фейком и
 * доказать, что:
 *   • активные правила реально загружаются и передаются в расчёт;
 *   • отсутствие правил → пустой результат (никакого fallback-графика);
 *   • бронирование, пересекающее границу диапазона, исключает слот.
 */

export interface AvailabilityQuery {
  organizationSlug: string;
  hostSlug: string;
  serviceSlug: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  timeZone: string;
}

export interface ResolvedHostService {
  hostId: string;
  service: ServiceConfig;
}

export interface AvailabilityDataSource {
  /** Резолвит host + service по slug'ам. null, если не найдено/не публично. */
  getHostService(query: AvailabilityQuery): Promise<ResolvedHostService | null>;
  /** Активные правила расписания host (booking_availability_rules, is_active). */
  getActiveRules(hostId: string): Promise<AvailabilityRule[]>;
  /** Брони, ПЕРЕСЕКАЮЩИЕ [rangeStart, rangeEnd] (interval overlap, не containment). */
  getConflictingBookings(
    hostId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<ExistingBooking[]>;
  /** Blackout-периоды, пересекающие диапазон. */
  getBlackouts(
    hostId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<BlackoutPeriod[]>;
}

/**
 * Предикат пересечения интервалов: бронь конфликтует с диапазоном, если
 *   booking.start < rangeEnd  И  booking.end > rangeStart.
 *
 * Это ровно та семантика, которую реализует SQL-выборка в route
 * (`.lt("requested_start_at", rangeEnd).gt("requested_end_at", rangeStart)`).
 * Прежняя containment-логика (`start >= rangeStart AND end <= rangeEnd`)
 * теряла брони, начавшиеся до `start` или закончившиеся после `end`, из-за
 * чего занятый слот мог показаться свободным.
 */
export function bookingOverlapsRange(
  booking: ExistingBooking,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const start = new Date(booking.requested_start_at);
  const end = new Date(booking.requested_end_at);
  return start < rangeEnd && end > rangeStart;
}

export async function resolveAvailability(
  source: AvailabilityDataSource,
  query: AvailabilityQuery,
  now?: Date,
): Promise<AvailabilityByDate> {
  const hostService = await source.getHostService(query);
  if (!hostService) return {};

  const rules = await source.getActiveRules(hostService.hostId);
  if (rules.length === 0) return {};

  const rangeStart = new Date(`${query.start}T00:00:00Z`);
  const rangeEnd = new Date(`${query.end}T23:59:59Z`);

  const [bookings, blackouts] = await Promise.all([
    source.getConflictingBookings(hostService.hostId, rangeStart, rangeEnd),
    source.getBlackouts(hostService.hostId, rangeStart, rangeEnd),
  ]);

  return calculateAvailableSlots({
    startDate: query.start,
    endDate: query.end,
    timeZone: query.timeZone,
    rules,
    blackouts,
    existingBookings: bookings,
    service: hostService.service,
    now,
  });
}
