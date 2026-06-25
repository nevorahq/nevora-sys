import Link from "next/link";
import { SettingsIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { ServicesAddButton, ServicesListClient } from "./_components/services-client";

export default async function BookingServicesPage() {
  const { org } = await requireOrg();
  const { dict } = await getDictionary();
  const d = dict.booking.services;

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("booking_services")
    .select(
      "id, name, slug, description, duration_minutes, slot_interval_minutes, buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_window_days, is_active",
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{d.title}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{d.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <ServicesAddButton labels={{
            addService:      d.addService,
            name:            d.name,
            duration:        d.duration,
            durationUnit:    d.durationUnit,
            bookingWindow:   d.bookingWindow,
            bookingWindowUnit: d.bookingWindowUnit,
          }} />
          <Link
            href={ROUTES.booking}
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            ← {dict.booking.dashboard.title}
          </Link>
        </div>
      </div>

      {(!services || services.length === 0) ? (
        <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-12 text-center">
          <SettingsIcon className="mx-auto h-12 w-12 text-text-muted mb-3" strokeWidth={1} />
          <p className="text-sm text-text-secondary">{d.noServices}</p>
        </div>
      ) : (
        <ServicesListClient
          services={services}
          labels={{
            addService:       d.addService,
            name:             d.name,
            duration:         d.duration,
            durationUnit:     d.durationUnit,
            bookingWindow:    d.bookingWindow,
            bookingWindowUnit: d.bookingWindowUnit,
            active:           d.active,
            slotInterval:     d.slotInterval,
            bufferBefore:     d.bufferBefore,
            bufferAfter:      d.bufferAfter,
          }}
        />
      )}
    </div>
  );
}
