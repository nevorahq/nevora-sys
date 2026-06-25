import Link from "next/link";
import { requireOrg } from "@/lib/auth/require-org";
import { getBookingRequests } from "@/modules/booking";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { CalendarCheckIcon } from "lucide-react";
import { BookingRequestActions } from "@/modules/booking/requests/components/booking-request-actions";

export default async function BookingRequestsPage() {
  const { org } = await requireOrg();
  const { dict } = await getDictionary();
  const d = dict.booking.requests;

  const requests = await getBookingRequests(org.id);

  const statusColors: Record<string, string> = {
    pending:  "bg-accent-yellow-soft text-text-primary",
    accepted: "bg-accent-green-soft text-text-primary",
    rejected: "bg-danger-soft text-danger",
    canceled: "bg-surface-sunken text-text-muted",
  };

  const statusLabels: Record<string, string> = {
    pending:  d.statusPending,
    accepted: d.statusAccepted,
    rejected: d.statusRejected,
    canceled: d.statusCanceled,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{d.title}</h1>
        </div>
        <Link
          href={ROUTES.booking}
          className="text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          ← {dict.booking.dashboard.title}
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-12 text-center">
          <CalendarCheckIcon className="mx-auto h-12 w-12 text-text-muted mb-3" strokeWidth={1} />
          <p className="text-sm text-text-secondary">No booking requests yet</p>
        </div>
      ) : (
        <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft">
                  {[d.clientName, d.service, d.host, d.dateTime, d.status, d.createdAt, d.actions].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="border-b border-border-soft last:border-0 hover:bg-surface-sunken/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-text-primary">
                      <p>{req.client_name}</p>
                      {req.client_phone && (
                        <p className="text-xs text-text-muted">{req.client_phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <p>{req.service_name}</p>
                      <p className="text-xs text-text-muted">{req.service_duration_minutes} min</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{req.host_display_name}</td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {new Date(req.requested_start_at).toLocaleString("ru-RU", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                        {statusLabels[req.status] ?? req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">
                      {new Date(req.created_at).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {req.lead_id && (
                          <Link
                            href={ROUTES.crm}
                            className="text-xs text-text-muted hover:text-text-primary underline"
                          >
                            {d.openLead}
                          </Link>
                        )}
                        {req.status === "pending" && (
                          <BookingRequestActions requestId={req.id} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden flex flex-col divide-y divide-border-soft">
            {requests.map((req) => (
              <div key={req.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text-primary">{req.client_name}</p>
                    <p className="text-sm text-text-secondary">{req.service_name} · {req.host_display_name}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[req.status] ?? ""}`}>
                    {statusLabels[req.status] ?? req.status}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(req.requested_start_at).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                {req.lead_id && (
                  <Link
                    href={ROUTES.crm}
                    className="text-xs text-text-muted hover:text-text-primary underline w-fit"
                  >
                    {d.openLead} →
                  </Link>
                )}
                {req.status === "pending" && (
                  <div className="pt-1">
                    <BookingRequestActions requestId={req.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
