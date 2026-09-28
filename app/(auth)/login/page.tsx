import { LoginForm } from "@/features/auth/components/login-form";
import { resolveProductEntryRoute, ROUTES } from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { dict, locale } = await getDictionary();
  const params = await searchParams;
  const requestedDestination = Array.isArray(params.next) ? params.next[0] : params.next;
  const destination = resolveProductEntryRoute(requestedDestination) ?? ROUTES.appHome;

  return (
    <main className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher locale={locale} labels={dict.controls} iconOnly />
        <ThemeToggle labels={dict.controls} className="h-11 w-11 sm:h-9 sm:w-9" />
      </div>
      <LoginForm dict={dict} destination={destination} />
    </main>
  );
}
