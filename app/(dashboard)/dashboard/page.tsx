import { requireUser } from "@/lib/auth/require-user";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export default async function DashboardPage() {
  const [user, { dict, locale }] = await Promise.all([
    requireUser(),
    getDictionary(),
  ]);

  return (
    <main className="flex flex-1 flex-col p-6 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {dict.dashboard.title}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} />
          <ThemeToggle />
          <LogoutButton label={dict.nav.logout} />
        </div>
      </header>

      <div className="mt-8 flex flex-1 items-center justify-center soft-inset rounded-(--neu-radius-xl)">
        <p className="text-sm text-text-muted">{dict.dashboard.placeholder}</p>
      </div>
    </main>
  );
}
