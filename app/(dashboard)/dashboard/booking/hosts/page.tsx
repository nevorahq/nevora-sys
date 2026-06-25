import Link from "next/link";
import { UserCircleIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { HostsAddButton, HostsListClient } from "./_components/hosts-client";

export default async function BookingHostsPage() {
  const { org } = await requireOrg();
  const { dict } = await getDictionary();
  const d = dict.booking.hosts;

  const supabase = await createClient();
  const { data: hosts } = await supabase
    .from("booking_host_profiles")
    .select(
      "id, host_slug, display_name, public_title, avatar_url, timezone, is_active, sort_order",
    )
    .eq("organization_id", org.id)
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{d.title}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{d.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <HostsAddButton labels={{
            addHost:     d.addHost,
            displayName: d.displayName,
            publicTitle: d.publicTitle,
            hostSlug:    d.hostSlug,
            timezone:    d.timezone,
          }} />
          <Link
            href={ROUTES.booking}
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            ← {dict.booking.dashboard.title}
          </Link>
        </div>
      </div>

      {(!hosts || hosts.length === 0) ? (
        <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-12 text-center">
          <UserCircleIcon className="mx-auto h-12 w-12 text-text-muted mb-3" strokeWidth={1} />
          <p className="text-sm font-medium text-text-primary">{d.noHosts}</p>
          <p className="mt-1 text-xs text-text-muted">{d.noHostsHint}</p>
        </div>
      ) : (
        <HostsListClient
          hosts={hosts}
          labels={{
            addHost:     d.addHost,
            displayName: d.displayName,
            publicTitle: d.publicTitle,
            hostSlug:    d.hostSlug,
            timezone:    d.timezone,
            active:      d.active,
            inactive:    d.inactive,
          }}
        />
      )}
    </div>
  );
}
