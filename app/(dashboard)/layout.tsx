import { getDictionary } from "@/shared/i18n/get-dictionary";
import { cookies } from "next/headers";
import { Sidebar } from "@/shared/ui/sidebar";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { Notifications } from "@/shared/ui/notifications";
import { HeaderActions } from "@/shared/ui/header-actions";
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
import { getPendingAccountDeletion } from "@/modules/settings/queries/get-account-deletion-status";
import { AccountDeletionBanner } from "@/modules/settings/components/AccountDeletionBanner";
import { NotificationProvider } from "@/modules/notifications/components/notification-provider";
import { getNotificationCounters } from "@/modules/notifications/queries/get-notification-counters";
import { getUnreadNotifications } from "@/modules/notifications/queries/get-user-notifications";
import { parseProductContext, PRODUCT_CONTEXT_COOKIE } from "@/modules/products/product-context";

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
  const [user, context, { dict, locale }, cookieStore] = await Promise.all([
    requireUser(),
    requireOrg(),
    getDictionary(),
    cookies(),
  ]);
  // This cookie is path-scoped to /dashboard/documents, so product navigation
  // is restored only on the shared Documents surface and cannot leak to other
  // dashboard routes.
  const product = parseProductContext(cookieStore.get(PRODUCT_CONTEXT_COOKIE)?.value);
  const [trial, limits, accessState, userOrganizations, notificationPreferences, initialNotificationCounters, initialNotifications, pendingDeletion] = await Promise.all([
    getTrialState(context.org.id),
    resolveAccountLimits(user.id, context.org.id),
    getOrganizationAccessState(context.org.id),
    getUserOrganizations(user.id),
    getNotificationPreferences(),
    getNotificationCounters(),
    getUnreadNotifications(),
    getPendingAccountDeletion(),
  ]);

  const accessCopy = {
    states: dict.access.states,
    restricted: dict.access.restricted,
    blockedDefault: dict.access.blockedDefault,
    blockedInvite: dict.access.blockedInvite,
    blockedExecute: dict.access.blockedExecute,
    blockedUpload: dict.access.blockedUpload,
    alertTitle: dict.access.alertTitle,
    ctaLabel: dict.access.ctaLabel,
  };

  return (
    <AccessStateProvider accessState={accessState} copy={accessCopy}>
      <NotificationProvider key={`${context.org.id}:${user.id}`} organizationId={context.org.id} userId={user.id} initialPreferences={notificationPreferences} initialCounters={initialNotificationCounters} initialNotifications={initialNotifications}>
        <div className="flex min-h-dvh">
          {/* Sidebar — навигация платформы (sticky, 100dvh, неподвижный) */}
          <Sidebar dict={dict} product={product} />

          {/* Main content area */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Header — user info, controls (прилипает к верху при скролле) */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-background px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <OrganizationSwitcher currentOrganizationId={context.org.id} organizations={userOrganizations} t={dict.organizationSwitcher} />
                <p className="hidden truncate text-sm text-text-muted sm:block">
                  {user.email?.split("@")[0]}
                </p>
                {limits.unlimitedAccess && <DeveloperAccessBadge />}
              </div>
              <HeaderActions label={dict.nav.actions}>
                <Notifications dict={dict} />
                <LanguageSwitcher locale={locale} iconOnly />
                <ThemeToggle />
                <LogoutButton label={dict.nav.logout} />
              </HeaderActions>
            </header>

            {/* Page content */}
            <main className="flex-1 p-6 md:p-8">
              {!limits.unlimitedAccess && <TrialBanner trial={trial} />}
              <ReadOnlyModeBanner />
              {pendingDeletion && <AccountDeletionBanner purgeAfter={pendingDeletion.purgeAfter} t={dict.settings.accountBanner} />}
              {children}
            </main>
          </div>
        </div>
      </NotificationProvider>
    </AccessStateProvider>
  );
}
