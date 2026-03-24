import { useState, useEffect } from "react";

export type Theme = "light" | "dark" | "warm" | "cool";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check local storage on initial load
    const saved = localStorage.getItem("cognition_theme");
    return (saved as Theme) || "light";
  });

  useEffect(() => {
    // Remove all previous theme classes
    const root = window.document.documentElement;
    root.classList.remove(
      "theme-light",
      "theme-dark",
      "theme-warm",
      "theme-cool"
    );

    // Add the current theme class (unless it's 'light', which is the default root)
    if (theme !== "light") {
      root.classList.add(`theme-${theme}`);
    }

    // Persist to local storage
    localStorage.setItem("cognition_theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
