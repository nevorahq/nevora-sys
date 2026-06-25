"use client";

import { useState, useCallback } from "react";
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { MonthCalendar } from "./month-calendar";
import { BookingRequestForm } from "./booking-request-form";
import type { PublicHostProfile } from "../hosts/types/booking-host.types";
import type { PublicBookingService } from "../services/types/booking-service.types";
import type { TimeSlot } from "../availability/types/availability.types";

type View = "services" | "booking" | "success" | "error";

interface PublicBookingShellProps {
  organizationSlug: string;
  host: PublicHostProfile;
  services: PublicBookingService[];
  defaultTimezone: string;
  labels: {
    chooseService: string;
    chooseDate: string;
    chooseTime: string;
    yourDetails: string;
    bookWith: string;
    durationLabel: string;
    stepOf: string;
    back: string;
    noAvailableSlots: string;
    successTitle: string;
    successMessage: string;
    errorTitle: string;
    errorMessage: string;
    namePlaceholder: string;
    emailPlaceholder: string;
    phonePlaceholder: string;
    messagePlaceholder: string;
    submitRequest: string;
    submitting: string;
  };
}

function formatSlotTime(isoString: string, timezone: string): string {
  return new Date(isoString).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

export function PublicBookingShell({
  organizationSlug,
  host,
  services,
  defaultTimezone,
  labels,
}: PublicBookingShellProps) {
  const timezone = typeof window !== "undefined"
    ? (Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTimezone)
    : defaultTimezone;

  const today = new Date();
  const [view, setView] = useState<View>("services");
  const [selectedService, setSelectedService] = useState<PublicBookingService | null>(null);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [daySlots, setDaySlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch slots for one selected day only
  const fetchDaySlots = useCallback(
    async (svcSlug: string, dateStr: string) => {
      setLoadingSlots(true);
      setDaySlots([]);
      setSelectedSlot(null);
      try {
        const params = new URLSearchParams({
          organizationSlug,
          hostSlug: host.slug,
          serviceSlug: svcSlug,
          start: dateStr,
          end: dateStr,
          timeZone: timezone,
        });
        const res = await fetch(`/api/public/booking/availability?${params}`);
        if (res.ok) {
          const json = await res.json();
          const slots: TimeSlot[] = (json.data ?? {})[dateStr] ?? [];
          setDaySlots(slots);
        }
      } finally {
        setLoadingSlots(false);
      }
    },
    [organizationSlug, host.slug, timezone],
  );

  function handleSelectService(svc: PublicBookingService) {
    setSelectedService(svc);
    setSelectedDate(null);
    setDaySlots([]);
    setSelectedSlot(null);
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setView("booking");
  }

  function handlePrevMonth() {
    const d = new Date(calYear, calMonth - 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setSelectedDate(null);
    setDaySlots([]);
    setSelectedSlot(null);
  }

  function handleNextMonth() {
    const d = new Date(calYear, calMonth + 1, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setSelectedDate(null);
    setDaySlots([]);
    setSelectedSlot(null);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    if (selectedService) {
      fetchDaySlots(selectedService.slug, date);
    }
  }

  const canGoPrev =
    calYear > today.getFullYear() ||
    (calYear === today.getFullYear() && calMonth > today.getMonth());

  // ── SUCCESS ────────────────────────────────────────────────
  if (view === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircleIcon className="h-14 w-14 text-accent-green" strokeWidth={1.5} />
        <h2 className="text-xl font-bold text-text-primary">{labels.successTitle}</h2>
        <p className="text-sm text-text-secondary max-w-xs">{labels.successMessage}</p>
        <button
          type="button"
          onClick={() => {
            setView("services");
            setSelectedService(null);
            setSelectedDate(null);
            setDaySlots([]);
            setSelectedSlot(null);
          }}
          className="mt-2 text-sm text-text-secondary underline hover:text-text-primary transition-colors"
        >
          {labels.back}
        </button>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────
  if (view === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <XCircleIcon className="h-14 w-14 text-danger" strokeWidth={1.5} />
        <h2 className="text-xl font-bold text-text-primary">{labels.errorTitle}</h2>
        <p className="text-sm text-text-secondary max-w-xs">{errorMsg || labels.errorMessage}</p>
        <button
          type="button"
          onClick={() => setView("booking")}
          className="mt-2 text-sm text-text-secondary underline hover:text-text-primary transition-colors"
        >
          {labels.back}
        </button>
      </div>
    );
  }

  // ── SERVICES ───────────────────────────────────────────────
  if (view === "services") {
    if (services.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-text-muted">
          No services available
        </p>
      );
    }
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">{labels.chooseService}</h2>
        <ul className="flex flex-col gap-2">
          {services.map((svc) => (
            <li key={svc.slug}>
              <button
                type="button"
                onClick={() => handleSelectService(svc)}
                className={cn(
                  "w-full flex items-center gap-4 rounded-(--neu-radius-lg) p-4 text-left",
                  "border border-border-soft bg-surface shadow-neu-card",
                  "hover:shadow-neu-lg hover:border-border-strong transition-all",
                  "active:shadow-neu-inset active:scale-[0.99]",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-primary">{svc.name}</p>
                  {svc.description && (
                    <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{svc.description}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1 text-text-muted">
                  <ClockIcon className="h-4 w-4" />
                  <span className="text-sm">
                    {labels.durationLabel.replace("{{duration}}", String(svc.durationMinutes))}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // ── BOOKING (calendar + slots + form) ─────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* Back + service badge */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setView("services");
            setSelectedDate(null);
            setDaySlots([]);
            setSelectedSlot(null);
          }}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors -ml-1 p-1"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {labels.back}
        </button>
        {selectedService && (
          <div className="flex items-center gap-1.5 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-3 py-1">
            <ClockIcon className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-xs font-medium text-text-secondary">{selectedService.name}</span>
            <span className="text-xs text-text-muted">
              · {selectedService.durationMinutes} мин
            </span>
          </div>
        )}
      </div>

      {/* Month calendar — все дни активны, нет prefetch */}
      <section>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
          {labels.chooseDate}
        </h2>
        <MonthCalendar
          year={calYear}
          month={calMonth}
          availableDates={new Set()}
          selectedDate={selectedDate}
          loading={false}
          onSelectDate={handleSelectDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          canGoPrev={canGoPrev}
        />
      </section>

      {/* Time slots — появляются только после выбора дня */}
      {selectedDate && (
        <section>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            {labels.chooseTime}
            <span className="ml-2 text-xs normal-case font-normal text-text-muted">
              {formatDate(selectedDate)}
            </span>
          </h2>

          {loadingSlots ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-(--neu-radius-md) bg-surface-sunken animate-pulse"
                />
              ))}
            </div>
          ) : daySlots.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              {labels.noAvailableSlots}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {daySlots.map((slot) => {
                const isSelected = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-(--neu-radius-md) border px-3 py-3 text-sm font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                      isSelected
                        ? "bg-text-primary border-text-primary text-text-inverse shadow-neu-inset"
                        : "bg-surface border-border-soft shadow-neu-card text-text-primary hover:border-border-strong hover:shadow-neu-lg active:shadow-neu-inset",
                    )}
                  >
                    {formatSlotTime(slot.start, timezone)}
                    {" — "}
                    {formatSlotTime(slot.end, timezone)}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Contact form */}
      {selectedSlot && selectedService && (
        <section>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">
            {labels.yourDetails}
          </h2>
          <BookingRequestForm
            organizationSlug={organizationSlug}
            hostSlug={host.slug}
            service={selectedService}
            slot={selectedSlot}
            timezone={timezone}
            labels={labels}
            onSuccess={() => setView("success")}
            onError={(msg) => {
              setErrorMsg(msg);
              setView("error");
            }}
          />
        </section>
      )}
    </div>
  );
}
