import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { getDictionary } from "@/shared/i18n/get-dictionary";

/**
 * Onboarding Layout — минималистичный, без Sidebar и Dashboard-хедера.
 *
 * Пользователь здесь впервые после регистрации.
 * Не должно быть лишнего — только форма создания org.
 *
 * Структура:
 *   - Шапка: название приложения + controls (тема, язык)
 *   - Центр: форма
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getDictionary();

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Minimal header */}
      <header className="absolute top-0 right-0 flex items-center gap-2 p-4">
        <LanguageSwitcher locale={locale} />
        <ThemeToggle />
      </header>

      {/* Centered content */}
      <main className="flex flex-1 items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}
