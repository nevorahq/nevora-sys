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
  title: "nevora-sys",
  description: "Personal productivity system built with Next.js and Supabase",
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
