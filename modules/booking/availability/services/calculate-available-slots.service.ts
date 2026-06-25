import type {
  TimeSlot,
  AvailabilityByDate,
  AvailabilityRule,
  BlackoutPeriod,
  ExistingBooking,
  ServiceConfig,
} from "../types/availability.types";

/**
 * Вспомогательные функции для работы с датами и timezone.
 * Нативный JS: Intl + Date. Без внешних библиотек.
 */

/** Получает yyyy-MM-dd в указанном timezone. */
function toLocalDateString(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

/** Получает день недели (0=Sun..6=Sat) в указанном timezone. */
function getDayOfWeekInTz(date: Date, tz: string): number {
  const weekdayNum = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekdayNum] ?? 0;
}

/**
 * Разбирает "HH:MM:SS" в { hours, minutes }.
 */
function parseTime(t: string): { hours: number; minutes: number } {
  const [h, m] = t.split(":").map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/**
 * Создаёт UTC Date из локальной даты и времени в указанном timezone.
 * Пример: dateStr="2026-06-15", timeStr="09:00", tz="Europe/Chisinau" → 06:00Z
 *
 * Алгоритм: берём произвольную точку UTC (epoch), форматируем её в целевой TZ
 * через formatToParts, находим точное смещение для этого момента, затем
 * итеративно уточняем — это устраняет зависимость от системного timezone сервера.
 */
function localDateTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  // Шаг 1: получаем числа из строк
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });

  // Шаг 2: берём начальное приближение — UTC с теми же цифрами
  let guess = Date.UTC(year!, (month! - 1), day!, hours!, minutes!, 0);

  // Шаг 3: до 3 итераций уточнения (перекрывает DST-скачки ±2 часа)
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(guess));
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") p[part.type] = parseInt(part.value, 10);
    }
    // В en-US с hour12:false "24" означает полночь следующего дня
    const h = p.hour === 24 ? 0 : (p.hour ?? 0);
    const actualUtcMs =
      Date.UTC(p.year!, (p.month! - 1), p.day!, h, p.minute!, p.second!);
    const targetUtcMs =
      Date.UTC(year!, (month! - 1), day!, hours!, minutes!, 0);
    guess += targetUtcMs - actualUtcMs;
  }

  return new Date(guess);
}

/**
 * Добавляет минуты к Date.
 */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Проверяет перекрытие двух отрезков [a1,a2) и [b1,b2).
 */
function overlaps(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && a2 > b1;
}

/**
 * Основная функция расчёта доступных слотов.
 *
 * Алгоритм:
 * 1. Для каждого дня в диапазоне startDate..endDate
 * 2. Ищем правила работы для этого дня недели
 * 3. Генерируем слоты с шагом slot_interval_minutes
 * 4. Фильтруем: слишком скоро, вне booking_window, blackout, existing bookings
 * 5. Возвращаем AvailabilityByDate
 */
export function calculateAvailableSlots(params: {
  startDate: string;
  endDate: string;
  timeZone: string;
  rules: AvailabilityRule[];
  blackouts: BlackoutPeriod[];
  existingBookings: ExistingBooking[];
  service: ServiceConfig;
  now?: Date;
}): AvailabilityByDate {
  const {
    startDate, endDate, timeZone,
    rules, blackouts, existingBookings, service,
  } = params;

  const now = params.now ?? new Date();
  const minNoticeAt = addMinutes(now, service.minimum_notice_minutes);
  const maxWindowAt = addMinutes(now, service.booking_window_days * 24 * 60);

  const result: AvailabilityByDate = {};

  // Парсим существующие бронирования в Date объекты
  const bookingDates = existingBookings.map((b) => ({
    start: new Date(b.requested_start_at),
    end: new Date(b.requested_end_at),
  }));

  // Парсим blackout периоды
  const blackoutDates = blackouts.map((bl) => ({
    start: new Date(bl.starts_at),
    end: new Date(bl.ends_at),
  }));

  // Итерация по дням
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);

  while (current <= end) {
    const dateStr = toLocalDateString(current, timeZone);
    const dayOfWeek = getDayOfWeekInTz(current, timeZone);

    const dayRules = rules.filter(
      (r) => r.day_of_week === dayOfWeek,
    );

    const slots: TimeSlot[] = [];

    for (const rule of dayRules) {
      const { hours: startH, minutes: startM } = parseTime(rule.start_time);
      const { hours: endH, minutes: endM } = parseTime(rule.end_time);

      const ruleStartStr = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
      const ruleEndTime = endH * 60 + endM;

      let slotStart = localDateTimeToUtc(dateStr, ruleStartStr, timeZone);

      while (true) {
        const slotEnd = addMinutes(slotStart, service.duration_minutes);

        // Конец слота в минутах от полуночи — в локальном timezone (через Intl)
        const slotEndLocal = slotEnd.toLocaleString("en-US", {
          timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
        });
        const [slotEndH, slotEndM] = slotEndLocal.split(":").map(Number);
        const localEndMins = (slotEndH === 24 ? 0 : (slotEndH ?? 0)) * 60 + (slotEndM ?? 0);

        // Слот (без buffer) должен завершиться не позже конца рабочего дня
        if (localEndMins > ruleEndTime) break;

        // Слишком скоро (minimum_notice)
        const effectiveStart = addMinutes(slotStart, -service.buffer_before_minutes);
        if (effectiveStart < minNoticeAt) {
          slotStart = addMinutes(slotStart, service.slot_interval_minutes);
          continue;
        }

        // Вне окна бронирования
        if (slotStart > maxWindowAt) break;

        // Проверка blackout
        const inBlackout = blackoutDates.some((bl) =>
          overlaps(
            addMinutes(slotStart, -service.buffer_before_minutes),
            addMinutes(slotEnd, service.buffer_after_minutes),
            bl.start, bl.end,
          ),
        );
        if (!inBlackout) {
          // Проверка существующих бронирований
          const hasConflict = bookingDates.some((b) =>
            overlaps(
              addMinutes(slotStart, -service.buffer_before_minutes),
              addMinutes(slotEnd, service.buffer_after_minutes),
              addMinutes(b.start, -service.buffer_before_minutes),
              addMinutes(b.end, service.buffer_after_minutes),
            ),
          );

          if (!hasConflict) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }
        }

        slotStart = addMinutes(slotStart, service.slot_interval_minutes);
      }
    }

    if (slots.length > 0) {
      result[dateStr] = slots;
    }

    // Следующий день
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}
