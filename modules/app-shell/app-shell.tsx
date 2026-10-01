import { getDictionary } from "@/shared/i18n/get-dictionary";
import { Sidebar } from "@/shared/ui/sidebar";
import { ErrorCopyProvider } from "@/shared/ui/error-copy";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { Notifications } from "@/shared/ui/notifications";
import { HeaderActions } from "@/shared/ui/header-actions";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { PostHogIdentify } from "@/modules/cookie-consent";
import { requireUser } from "@/lib/auth/require-user";
import { requireOrg } from "@/lib/auth/require-org";
import { getOrganizationAccessState, getTrialState } from "@/modules/billing";
import { TrialBanner } from "@/modules/billing/components/trial-banner";
import { DeveloperAccessBadge } from "@/modules/billing/components/developer-access-badge";
import {
  AccessStateProvider,
  ReadOnlyModeBanner,
} from "@/modules/billing/components/access-state";
import { resolveAccountLimits } from "@/lib/billing";
import {
  OrganizationSwitcher,
  getUserOrganizations,
} from "@/modules/members";
import { getNotificationPreferences } from "@/modules/settings/notifications/queries/get-notification-preferences";
import { getPendingAccountDeletion } from "@/modules/settings/queries/get-account-deletion-status";
import { AccountDeletionBanner } from "@/modules/settings/components/AccountDeletionBanner";
import { NotificationProvider } from "@/modules/notifications/components/notification-provider";
import { getNotificationCounters } from "@/modules/notifications/queries/get-notification-counters";
import { getUnreadNotifications } from "@/modules/notifications/queries/get-user-notifications";

/**
 * The one protected app shell: every module (Home, Inbox, Tasks, Finance,
 * Subscriptions, Documents, Settings) renders inside it with the same sidebar,
 * so switching modules is plain navigation within one workspace.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const [user, context, { dict, locale }] = await Promise.all([
    requireUser(),
    requireOrg(),
    getDictionary(),
  ]);
  const [trial, limits, accessState, userOrganizations, notificationPreferences, initialNotificationCounters, initialNotifications, pendingDeletion] =
    await Promise.all([
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
      <ErrorCopyProvider copy={dict.errorBoundary}>
        <NotificationProvider
          key={`${context.org.id}:${user.id}`}
          organizationId={context.org.id}
          userId={user.id}
          initialPreferences={notificationPreferences}
          initialCounters={initialNotificationCounters}
          initialNotifications={initialNotifications}
        >
          <PostHogIdentify userId={user.id} />
          <div className="flex min-h-dvh">
            <Sidebar dict={dict} />

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-soft bg-background px-4 py-3.5 sm:px-6">
                <div className="flex min-w-0 items-center gap-2">
                  <OrganizationSwitcher
                    currentOrganizationId={context.org.id}
                    organizations={userOrganizations}
                    t={dict.organizationSwitcher}
                  />
                  <p className="hidden truncate text-sm text-text-muted sm:block">
                    {user.email?.split("@")[0]}
                  </p>
                  {limits.unlimitedAccess && <DeveloperAccessBadge label={dict.controls.developerAccess} />}
                </div>
                <HeaderActions label={dict.nav.actions}>
                  <Notifications dict={dict} />
                  <LanguageSwitcher locale={locale} labels={dict.controls} iconOnly />
                  <ThemeToggle labels={dict.controls} />
                  <LogoutButton label={dict.nav.logout} />
                </HeaderActions>
              </header>

              <main className="flex-1 p-4 sm:p-6 md:p-8">
                {!limits.unlimitedAccess && <TrialBanner trial={trial} />}
                <ReadOnlyModeBanner />
                {pendingDeletion && (
                  <AccountDeletionBanner
                    purgeAfter={pendingDeletion.purgeAfter}
                    t={dict.settings.accountBanner}
                  />
                )}
                {children}
              </main>
            </div>
          </div>
        </NotificationProvider>
      </ErrorCopyProvider>
    </AccessStateProvider>
  );
}
