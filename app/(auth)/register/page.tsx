import { RegisterForm } from "@/features/auth/components/register-form";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export default async function RegisterPage() {
  const { dict, locale } = await getDictionary();

  return (
    <main className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher locale={locale} />
        <ThemeToggle />
      </div>
      <RegisterForm dict={dict} />
    </main>
  );
}
