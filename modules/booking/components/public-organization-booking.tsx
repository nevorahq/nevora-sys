"use client";

import { useState } from "react";
import { ArrowLeftIcon, ChevronRightIcon, UserCircleIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { PublicBookingShell } from "./public-booking-shell";
import type { PublicHostProfile } from "../hosts/types/booking-host.types";
import type { PublicBookingService } from "../services/types/booking-service.types";

type PublicHostWithServices = PublicHostProfile & { services: PublicBookingService[] };

interface PublicOrganizationBookingProps {
  organizationSlug: string;
  hosts: PublicHostWithServices[];
  defaultTimezone: string;
  labels: {
    chooseSpecialist: string;
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

export function PublicOrganizationBooking({
  organizationSlug,
  hosts,
  defaultTimezone,
  labels,
}: PublicOrganizationBookingProps) {
  const [selectedHostSlug, setSelectedHostSlug] = useState<string | null>(
    hosts.length === 1 ? hosts[0]?.slug ?? null : null,
  );
  const selectedHost = hosts.find((host) => host.slug === selectedHostSlug) ?? null;

  if (hosts.length === 0) {
    return (
      <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface px-6 py-12 text-center shadow-neu-card">
        <UserCircleIcon className="mx-auto h-12 w-12 text-text-muted" strokeWidth={1} />
        <p className="mt-3 text-sm font-medium text-text-primary">Bookings are not available yet</p>
        <p className="mt-1 text-sm text-text-muted">This business has not added an active specialist yet.</p>
      </div>
    );
  }

  if (!selectedHost) {
    return (
      <ul className="flex flex-col gap-3">
        {hosts.map((host) => (
          <li key={host.slug}>
            <button
              type="button"
              onClick={() => setSelectedHostSlug(host.slug)}
              className={cn(
                "flex w-full items-center gap-4 rounded-(--neu-radius-lg) bg-surface p-4 text-left",
                "border border-border-soft shadow-neu-card transition-all",
                "hover:border-border-strong hover:shadow-neu-lg active:scale-[0.99] active:shadow-neu-inset",
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-lg font-semibold text-text-secondary">
                {host.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text-primary">{host.displayName}</p>
                {host.publicTitle && <p className="truncate text-sm text-text-secondary">{host.publicTitle}</p>}
                <p className="mt-0.5 text-xs text-text-muted">
                  {host.services.length > 0 ? `${host.services.length} service${host.services.length === 1 ? "" : "s"} available` : "No services available"}
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-text-muted" />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {hosts.length > 1 && (
        <button
          type="button"
          onClick={() => setSelectedHostSlug(null)}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 p-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Choose another specialist
        </button>
      )}

      <div className="flex items-center gap-3 rounded-(--neu-radius-lg) border border-border-soft bg-surface p-4 shadow-neu-card">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-lg font-semibold text-text-secondary">
          {selectedHost.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{selectedHost.displayName}</p>
          {selectedHost.publicTitle && <p className="text-sm text-text-secondary">{selectedHost.publicTitle}</p>}
        </div>
      </div>

      <PublicBookingShell
        organizationSlug={organizationSlug}
        host={selectedHost}
        services={selectedHost.services}
        defaultTimezone={defaultTimezone}
        labels={labels}
      />
    </div>
  );
}
