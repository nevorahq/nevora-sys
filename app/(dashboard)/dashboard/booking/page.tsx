import Link from "next/link";
import {
  CalendarCheckIcon, ClockIcon, CalendarIcon, ExternalLinkIcon,
  UsersIcon, SettingsIcon,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { getBookingRequestsSummary, getBookingRequests } from "@/modules/booking";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES, bookingPageUrl } from "@/shared/config/routes";
import { createClient } from "@/lib/supabase/server";
import { PublicPageStatus } from "@/modules/booking/components/public-page-status";

export default async function BookingDashboardPage() {
  const { org, membership } = await requireOrg();
  const { dict } = await getDictionary();
  const d = dict.booking.dashboard;

  const supabase = await createClient();
  const [summary, recentRequests, bookingPage] = await Promise.all([
    getBookingRequestsSummary(org.id),
    getBookingRequests(org.id, { limit: 5 }),
    supabase
      .from("booking_pages")
      .select("public_enabled")
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);
  const publicEnabled = bookingPage.data?.public_enabled ?? false;
  const canManage = ["owner", "admin"].includes(membership.roleId);

  const statCards = [
    {
      label: d.totalRequests,
      value: summary.total,
      icon: CalendarCheckIcon,
    },
    {
      label: d.pendingRequests,
      value: summary.pending,
      icon: ClockIcon,
      highlight: summary.pending > 0,
    },
    {
      label: d.todayRequests,
      value: summary.today,
      icon: CalendarIcon,
    },
  ];

  const navCards = [
    { href: ROUTES.bookingRequests, label: dict.booking.requests.title, icon: CalendarCheckIcon },
    { href: ROUTES.bookingHosts, label: dict.booking.hosts.title, icon: UsersIcon },
    { href: ROUTES.bookingServices, label: dict.booking.services.title, icon: SettingsIcon },
    { href: ROUTES.bookingAvailability, label: dict.booking.availability.title, icon: CalendarIcon },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{d.title}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{d.subtitle}</p>
        </div>
        {publicEnabled ? (
          <Link
            href={bookingPageUrl(org.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-neu-control hover:text-text-primary hover:shadow-neu-card transition-all"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            {d.viewPublicPage}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-(--neu-radius-pill) border border-border-soft bg-surface-sunken px-4 py-2 text-sm font-medium text-text-muted">
            Page unpublished
          </span>
        )}
      </div>

      <PublicPageStatus
        url={bookingPageUrl(org.slug)}
        publicEnabled={publicEnabled}
        canManage={canManage}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-(--neu-radius-lg) bg-surface border border-border-soft shadow-neu-card p-5 flex items-center gap-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-secondary">
                <Icon size={20} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{card.value}</p>
                <p className="text-xs text-text-muted">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {navCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="flex flex-col items-center justify-center gap-2 rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card p-4 hover:shadow-neu-lg hover:border-border-strong transition-all text-center"
            >
              <Icon size={22} className="text-text-secondary" strokeWidth={1.5} />
              <span className="text-xs font-medium text-text-secondary">{card.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Recent requests */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            {dict.booking.requests.title}
          </h2>
          <Link
            href={ROUTES.bookingRequests}
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            View all →
          </Link>
        </div>

        {recentRequests.length === 0 ? (
          <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-8 text-center">
            <CalendarCheckIcon className="mx-auto h-10 w-10 text-text-muted mb-3" strokeWidth={1} />
            <p className="text-sm font-medium text-text-primary">{d.noRequests}</p>
            <p className="mt-1 text-xs text-text-muted">{d.noRequestsHint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-sm p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {req.client_name}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {req.service_name} · {req.host_display_name}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    req.status === "pending"
                      ? "bg-accent-yellow-soft text-text-primary"
                      : req.status === "accepted"
                        ? "bg-accent-green-soft text-text-primary"
                        : "bg-surface-sunken text-text-muted"
                  }`}
                >
                  {dict.booking.requests[`status${req.status.charAt(0).toUpperCase()}${req.status.slice(1)}` as keyof typeof dict.booking.requests] ?? req.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
