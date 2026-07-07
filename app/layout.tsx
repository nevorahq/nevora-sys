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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-text-primary">
        <StoreProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
