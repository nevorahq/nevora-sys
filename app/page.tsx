import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export default async function HomePage() {
  const { dict, locale } = await getDictionary();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher locale={locale} />
        <ThemeToggle />
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-text-primary">
          {dict.common.appName}
        </h1>
        <p className="mt-2 text-base text-text-secondary">{dict.home.subtitle}</p>
      </div>

      <div className="flex gap-3">
        <Link
          href={ROUTES.login}
          className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-6 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98]"
        >
          {dict.home.loginButton}
        </Link>
        <Link
          href={ROUTES.register}
          className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-surface px-6 py-2.5 text-sm font-semibold text-text-primary border border-border-soft shadow-neu-control transition-all hover:shadow-neu-card hover:border-border-strong active:shadow-neu-inset active:scale-[0.98]"
        >
          {dict.home.registerButton}
        </Link>
      </div>
    </main>
  );
}
