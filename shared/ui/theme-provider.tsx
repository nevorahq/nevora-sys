"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

/** Initial theme = whatever the anti-FOUC script already applied to <html>. */
function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  const stored = localStorage.getItem("nevora_theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToThemePreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server snapshot is also used by React's first client render. The
  // browser preference is read only after hydration, so ThemeToggle's icon
  // cannot disagree with the HTML emitted by the server.
  const storedTheme = useSyncExternalStore<Theme>(
    subscribeToThemePreference,
    readInitialTheme,
    (): Theme => "light",
  );
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const theme = selectedTheme ?? storedTheme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Do not overwrite a saved preference with the server fallback while the
    // external store is reconciling immediately after hydration.
    if (selectedTheme) localStorage.setItem("nevora_theme", theme);
  }, [selectedTheme, theme]);

  const toggleTheme = () => setSelectedTheme(theme === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
