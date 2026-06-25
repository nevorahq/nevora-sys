"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { TimeSlot } from "../availability/types/availability.types";
import type { PublicBookingService } from "../services/types/booking-service.types";

interface BookingRequestFormProps {
  organizationSlug: string;
  hostSlug: string;
  service: PublicBookingService;
  slot: TimeSlot;
  timezone: string;
  labels: {
    namePlaceholder: string;
    emailPlaceholder: string;
    phonePlaceholder: string;
    messagePlaceholder: string;
    submitRequest: string;
    submitting: string;
  };
  onSuccess: () => void;
  onError: (msg: string) => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  message: string;
}

interface FieldErrors {
  name?: string;
  contact?: string;
  email?: string;
  phone?: string;
}

function validateForm(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.name.trim()) {
    errors.name = "Имя обязательно";
  }
  if (!state.email.trim() && !state.phone.trim()) {
    errors.contact = "Укажите email или телефон";
  }
  if (state.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
    errors.email = "Некорректный email";
  }
  return errors;
}

async function fetchConflict(
  organizationSlug: string,
  startAt: string,
  endAt: string,
  email: string | null,
  phone: string | null,
): Promise<boolean> {
  const params = new URLSearchParams({ org: organizationSlug, startAt, endAt });
  if (email) params.set("email", email);
  if (phone) params.set("phone", phone);
  try {
    const res = await fetch(`/api/public/booking/client-check?${params}`);
    if (!res.ok) return false;
    const json = await res.json() as { conflict?: boolean };
    return json.conflict === true;
  } catch {
    return false;
  }
}

export function BookingRequestForm({
  organizationSlug,
  hostSlug,
  service,
  slot,
  timezone,
  labels,
  onSuccess,
  onError,
}: BookingRequestFormProps) {
  const [form, setForm] = useState<FormState>({
    name: "", email: "", phone: "", message: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();

  // Client conflict detection
  const [conflictWarning, setConflictWarning] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleConflictCheck(email: string, phone: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimEmail = email.trim();
    const trimPhone = phone.trim();

    // Need at least one valid contact to check
    const hasEmail = trimEmail.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail);
    const hasPhone = trimPhone.length > 0;

    if (!hasEmail && !hasPhone) {
      // Defer the reset so this helper never calls setState synchronously when
      // invoked from an effect (keeps it free of cascading-render warnings).
      debounceRef.current = setTimeout(() => setConflictWarning(false), 0);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setCheckingConflict(true);
      try {
        const conflict = await fetchConflict(
          organizationSlug,
          slot.start,
          slot.end,
          hasEmail ? trimEmail : null,
          hasPhone ? trimPhone : null,
        );
        setConflictWarning(conflict);
      } finally {
        setCheckingConflict(false);
      }
    }, 600);
  }

  // Selecting a different time invalidates the previous conflict result —
  // reset during render (not in an effect) to avoid an extra render pass.
  const [prevSlotStart, setPrevSlotStart] = useState(slot.start);
  if (slot.start !== prevSlotStart) {
    setPrevSlotStart(slot.start);
    setConflictWarning(false);
  }

  // Re-run the (debounced) conflict check whenever the slot changes.
  useEffect(() => {
    const trimEmail = form.email.trim();
    const trimPhone = form.phone.trim();
    if (trimEmail || trimPhone) {
      scheduleConflictCheck(form.email, form.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "email" || field === "phone") {
        scheduleConflictCheck(next.email, next.phone);
      }
      return next;
    });
    if (fieldErrors[field as keyof FieldErrors]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (conflictWarning) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/public/booking/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationSlug,
            hostSlug,
            serviceSlug: service.slug,
            start: slot.start,
            clientTimezone: timezone,
            client: {
              name: form.name.trim(),
              email: form.email.trim() || undefined,
              phone: form.phone.trim() || undefined,
              message: form.message.trim() || undefined,
            },
          }),
        });

        const json = await response.json();

        if (!response.ok || json.error) {
          if (json.error === "slot_conflict_client") {
            // Show as inline warning rather than full error page
            setConflictWarning(true);
            return;
          }
          onError(json.error ?? "server_error");
          return;
        }

        onSuccess();
      } catch {
        onError("network_error");
      }
    });
  }

  const inputClass = cn(
    "w-full rounded-(--neu-radius-md) border border-border-soft bg-surface",
    "px-4 py-3 text-sm text-text-primary placeholder:text-text-muted",
    "shadow-neu-inset focus:outline-none focus:ring-2 focus:ring-focus-ring",
    "transition-all",
  );

  const labelClass = "block text-xs font-medium text-text-secondary mb-1";
  const errorClass = "mt-1 text-xs text-danger";

  const isSubmitDisabled = isPending || checkingConflict || conflictWarning;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot — скрытое поле для ботов */}
      <input
        type="text"
        name="website_url"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px" }}
        autoComplete="off"
      />

      {/* Name */}
      <div>
        <label htmlFor="booking-name" className={labelClass}>
          Имя *
        </label>
        <input
          id="booking-name"
          type="text"
          autoComplete="name"
          placeholder={labels.namePlaceholder}
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className={cn(inputClass, fieldErrors.name && "border-danger")}
        />
        {fieldErrors.name && <p className={errorClass}>{fieldErrors.name}</p>}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="booking-phone" className={labelClass}>
          Телефон
        </label>
        <input
          id="booking-phone"
          type="tel"
          autoComplete="tel"
          placeholder={labels.phonePlaceholder}
          value={form.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          className={cn(
            inputClass,
            (fieldErrors.phone || fieldErrors.contact) && "border-danger",
            conflictWarning && "border-accent-yellow",
          )}
        />
        {fieldErrors.phone && <p className={errorClass}>{fieldErrors.phone}</p>}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="booking-email" className={labelClass}>
          Email
        </label>
        <input
          id="booking-email"
          type="email"
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          className={cn(
            inputClass,
            (fieldErrors.email || fieldErrors.contact) && "border-danger",
            conflictWarning && "border-accent-yellow",
          )}
        />
        {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
        {fieldErrors.contact && !fieldErrors.email && (
          <p className={errorClass}>{fieldErrors.contact}</p>
        )}
      </div>

      {/* Conflict warning banner */}
      {conflictWarning && (
        <div className="flex items-start gap-3 rounded-(--neu-radius-md) border border-accent-yellow bg-accent-yellow-soft px-4 py-3">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" strokeWidth={2} />
          <div>
            <p className="text-sm font-medium text-text-primary">
              У вас уже есть запись на это время
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Ваш предыдущий сеанс ещё не завершён. Запись станет доступна после его окончания.
            </p>
          </div>
        </div>
      )}

      {/* Message */}
      <div>
        <label htmlFor="booking-message" className={labelClass}>
          Сообщение
        </label>
        <textarea
          id="booking-message"
          rows={3}
          placeholder={labels.messagePlaceholder}
          value={form.message}
          onChange={(e) => handleChange("message", e.target.value)}
          className={cn(inputClass, "resize-none")}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className={cn(
          "mt-2 inline-flex items-center justify-center rounded-(--neu-radius-pill)",
          "bg-text-primary px-6 py-3.5 text-sm font-semibold text-text-inverse",
          "shadow-neu-control transition-all",
          "hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98]",
          "disabled:opacity-60 disabled:pointer-events-none",
          "min-h-[48px]",
        )}
      >
        {isPending
          ? labels.submitting
          : checkingConflict
            ? "Проверка…"
            : labels.submitRequest}
      </button>
    </form>
  );
}
