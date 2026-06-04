"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/shared/utils/cn";

interface ThemeToggleProps {
  className?: string;
  size?: number;
}

export function ThemeToggle({ className, size = 18 }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
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
