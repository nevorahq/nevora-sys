import { getDictionary } from "@/shared/i18n/get-dictionary";
import { Sidebar } from "@/shared/ui/sidebar";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { Notifications } from "@/shared/ui/notifications";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { requireUser } from "@/lib/auth/require-user";
import { requireOrg } from "@/lib/auth/require-org";
import { getTaskSummary } from "@/features/todos/queries/get-task-summary";
import { getUpcomingRenewals } from "@/modules/subtracker/queries/get-upcoming-renewals";
import { getBookingRequests } from "@/modules/booking";
import { getTrialState } from "@/modules/billing";
import { TrialBanner } from "@/modules/billing/components/trial-banner";
import { DeveloperAccessBadge } from "@/modules/billing/components/developer-access-badge";
import { resolveAccountLimits } from "@/lib/billing";

/**
 * Dashboard Layout — обёртка для ВСЕХ защищённых страниц.
 *
 * Структура:
 * ┌─────────┬────────────────────────────────┐
 * │         │  Header (user, theme, logout)   │
 * │ Sidebar ├────────────────────────────────┤
 * │         │  Content (page.tsx)             │
 * │         │                                │
 * └─────────┴────────────────────────────────┘
 *
 * Почему sidebar и header в layout, а не в каждой page:
 * - DRY: не дублировать в /dashboard, /dashboard/tasks, /dashboard/money
 * - Консистентность: одинаковая навигация на всех страницах
 * - Производительность: layout НЕ перерендеривается при навигации
 *   между страницами (Next.js App Router кеширует layouts)
 *
 * Server Component — читает user и dict на сервере.
 * Sidebar — Client Component (usePathname), получает dict через props.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, context, { dict, locale }, taskSummary, renewals] = await Promise.all([
    requireUser(),
    requireOrg(),
    getDictionary(),
    getTaskSummary(),
    getUpcomingRenewals(),
  ]);
  const [trial, bookingRequests, limits] = await Promise.all([
    getTrialState(context.org.id),
    getBookingRequests(context.org.id, { status: "pending", limit: 5 }),
    resolveAccountLimits(user.id, context.org.id),
  ]);

  return (
    <div className="flex h-full min-h-screen">
      {/* Sidebar — навигация платформы */}
      <Sidebar dict={dict} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header — user info, controls */}
        <header className="flex items-center justify-between border-b border-border-soft px-6 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm text-text-muted">
              {user.email?.split("@")[0]}
            </p>
            {limits.unlimitedAccess && <DeveloperAccessBadge />}
          </div>
          <div className="flex items-center gap-2">
            <Notifications
              overdueCount={taskSummary.overdue}
              renewals={renewals}
              bookingRequests={bookingRequests}
              dict={dict}
            />
            <LanguageSwitcher locale={locale} />
            <ThemeToggle />
            <LogoutButton label={dict.nav.logout} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {!limits.unlimitedAccess && <TrialBanner trial={trial} />}
          {children}
        </main>
      </div>
    </div>
  );
}
