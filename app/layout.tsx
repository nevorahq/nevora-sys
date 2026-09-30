import type { Metadata } from "next";
// Самохостинг шрифтов через @fontsource — woff2 поставляются как npm-пакеты
// и бандлятся webpack'ом. Никакой загрузки с fonts.googleapis.com во время
// сборки → build воспроизводим в CI/офлайн. Inter Variable включает
// latin + latin-ext + cyrillic (приложение на русском, lang="ru").
// import "@fontsource-variable/inter";
import "@fontsource/geist-mono/400.css";
import "./globals.css";
import { ThemeProvider } from "@/shared/ui/theme-provider";
import { StoreProvider } from "@/store/provider";
import { getDictionaryFor, getPublicLocale } from "@/shared/i18n/get-dictionary";
import { CookieConsentBanner, PostHogProvider, getPostHogConfig } from "@/modules/cookie-consent";

export const metadata: Metadata = {
  title: {
    default: "Nevora Business OS",
    template: "%s — Nevora Business OS",
  },
  description:
    "Connected Business Operations for tasks, projects, money, documents, subscriptions, Action Center and AI-assisted workflows.",
  keywords: [
    "business operating system",
    "small business operations",
    "task and finance workspace",
    "document and subscription management",
    "business action center",
    "AI-assisted business workflows",
  ],
  openGraph: {
    title: "Nevora Business OS",
    description:
      "Connected Business Operations for tasks, money, documents, subscriptions and review-first AI workflows.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Nevora Business OS",
    description:
      "Connected Business Operations for tasks, money, documents, subscriptions and review-first AI workflows.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `<html lang>` следует выбранной публичной локали (en/ru/ro) из cookie —
  // раньше был жёстко "en". Языковое меню лендинга и переключатель приложения
  // держат cookie в актуальном состоянии, так что переходы сохраняют язык.
  const locale = await getPublicLocale();
  // Все три среза: баннер следует `<html lang>`, который лендинг `/en` `/ru` `/ro`
  // поправляет на клиенте, если cookie не совпадает с URL (типично для первого визита).
  const cookieConsentLabels = {
    en: getDictionaryFor("en").cookieConsent,
    ru: getDictionaryFor("ru").cookieConsent,
    ro: getDictionaryFor("ro").cookieConsent,
  };

  return (
    <html
      lang={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-text-primary">
        <StoreProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </StoreProvider>
        <PostHogProvider config={getPostHogConfig()} />
        <CookieConsentBanner locale={locale} labels={cookieConsentLabels} />
      </body>
    </html>
  );
}
