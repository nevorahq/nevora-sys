import Link from "next/link";
import { CalendarIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { AvailabilityEditor } from "@/modules/booking/availability/components/availability-editor";

export default async function BookingAvailabilityPage() {
  const { org } = await requireOrg();
  const { dict } = await getDictionary();
  const d = dict.booking.availability;

  const supabase = await createClient();

  const { data: hosts } = await supabase
    .from("booking_host_profiles")
    .select("id, display_name, host_slug")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const firstHost = hosts?.[0];

  const { data: rules } = firstHost
    ? await supabase
        .from("booking_availability_rules")
        .select("day_of_week, start_time, end_time")
        .eq("booking_host_profile_id", firstHost.id)
        .eq("is_active", true)
        .order("day_of_week", { ascending: true })
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{d.title}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{d.subtitle}</p>
        </div>
        <Link
          href={ROUTES.booking}
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ← {dict.booking.dashboard.title}
        </Link>
      </div>

      {!hosts || hosts.length === 0 ? (
        <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-12 text-center">
          <CalendarIcon className="mx-auto h-12 w-12 text-text-muted mb-3" strokeWidth={1} />
          <p className="text-sm text-text-secondary">{d.selectHost}</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a host first in{" "}
            <Link href={ROUTES.bookingHosts} className="underline hover:text-text-primary">
              Hosts
            </Link>
          </p>
        </div>
      ) : (
        <AvailabilityEditor
          hosts={hosts}
          initialHostId={firstHost!.id}
          initialRules={rules ?? []}
        />
      )}
    </div>
  );
}
