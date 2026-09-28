"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface ThemeToggleProps {
  labels: Dictionary["controls"];
  className?: string;
  size?: number;
}

export function ThemeToggle({ labels, className, size = 18 }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? labels.themeToDark : labels.themeToLight}
      className={cn("soft-icon-button w-9 h-9", className)}
    >
      {theme === "light" ? (
        <Moon size={size} strokeWidth={1.75} />
      ) : (
        <Sun size={size} strokeWidth={1.75} />
      )}
    </button>
  );
}
