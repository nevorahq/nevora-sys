"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/shared/i18n/set-locale.action";
import { type Locale } from "@/shared/i18n/constants";
import { cn } from "@/shared/utils/cn";

interface LanguageSwitcherProps {
  locale: Locale;
  className?: string;
}

export function LanguageSwitcher({ locale, className }: LanguageSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const next: Locale = locale === "en" ? "ru" : "en";

  const handleSwitch = () => {
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={isPending}
      aria-label={`Switch to ${next.toUpperCase()}`}
      className={cn(
        "soft-icon-button w-9 h-9 text-xs font-semibold uppercase",
        "disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
    >
      {next}
    </button>
  );
}
