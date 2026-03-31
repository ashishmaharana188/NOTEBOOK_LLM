import { useState, useEffect } from "react";
import type { ReaderSettings } from "../../types/readerBackendTypes";

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 100,
  fontFamily: "Arial, sans-serif",
  theme: "light",
  lineHeight: 1.6,
  pageMargin: 9,
  flow: "paginated",
  spread: "auto",
};

export function useReaderSetting() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem("reader_settings");
      return saved
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem("reader_settings", JSON.stringify(settings));
  }, [settings]);

  const updateSetting = <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Raw CSS values for Direct Injection
  const themeStyles = {
    light: {
      body: { color: "#111827", background: "#ffffff" },
      "::selection": { background: "#bfdbfe" },
    },
    sepia: {
      body: { color: "#433422", background: "#f9f6ef" },
      "::selection": { background: "#e6d0b3" },
    },
    dark: {
      body: { color: "#e5e7eb", background: "#050505" },
      "::selection": { background: "#2f2f2f" },
    },
  };

  return { settings, updateSetting, themeStyles };
}
