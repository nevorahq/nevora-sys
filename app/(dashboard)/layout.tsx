import { getDictionary } from "@/shared/i18n/get-dictionary";
import { Sidebar } from "@/shared/ui/sidebar";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { Notifications } from "@/shared/ui/notifications";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { requireUser } from "@/lib/auth/require-user";
import { requireOrg } from "@/lib/auth/require-org";
import { getOrganizationAccessState, getTrialState } from "@/modules/billing";
import { TrialBanner } from "@/modules/billing/components/trial-banner";
import { DeveloperAccessBadge } from "@/modules/billing/components/developer-access-badge";
import { AccessStateProvider, ReadOnlyModeBanner } from "@/modules/billing/components/access-state";
import { resolveAccountLimits } from "@/lib/billing";
import { OrganizationSwitcher, getUserOrganizations } from "@/modules/members";
import { getNotificationPreferences } from "@/modules/settings/notifications/queries/get-notification-preferences";
import { NotificationProvider } from "@/modules/notifications/components/notification-provider";
import { getNotificationCounters } from "@/modules/notifications/queries/get-notification-counters";
import { getUnreadNotifications } from "@/modules/notifications/queries/get-user-notifications";

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
  const [user, context, { dict, locale }] = await Promise.all([
    requireUser(),
    requireOrg(),
    getDictionary(),
  ]);
  const [trial, limits, accessState, userOrganizations, notificationPreferences, initialNotificationCounters, initialNotifications] = await Promise.all([
    getTrialState(context.org.id),
    resolveAccountLimits(user.id, context.org.id),
    getOrganizationAccessState(context.org.id),
    getUserOrganizations(user.id),
    getNotificationPreferences(),
    getNotificationCounters(),
    getUnreadNotifications(),
  ]);

  return (
    <AccessStateProvider accessState={accessState}>
      <NotificationProvider key={`${context.org.id}:${user.id}`} organizationId={context.org.id} userId={user.id} initialPreferences={notificationPreferences} initialCounters={initialNotificationCounters} initialNotifications={initialNotifications}>
        <div className="flex min-h-dvh">
          {/* Sidebar — навигация платформы (sticky, 100dvh, неподвижный) */}
          <Sidebar dict={dict} />

          {/* Main content area */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Header — user info, controls (прилипает к верху при скролле) */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-background px-6 py-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <OrganizationSwitcher currentOrganizationId={context.org.id} organizations={userOrganizations} />
                <p className="truncate text-sm text-text-muted">
                  {user.email?.split("@")[0]}
                </p>
                {limits.unlimitedAccess && <DeveloperAccessBadge />}
              </div>
              <div className="flex items-center gap-2">
                <Notifications dict={dict} />
                <LanguageSwitcher locale={locale} />
                <ThemeToggle />
                <LogoutButton label={dict.nav.logout} />
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 p-6 md:p-8">
              {!limits.unlimitedAccess && <TrialBanner trial={trial} />}
              <ReadOnlyModeBanner />
              {children}
            </main>
          </div>
        </div>
      </NotificationProvider>
    </AccessStateProvider>
  );
}
