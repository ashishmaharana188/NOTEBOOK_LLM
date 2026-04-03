import type { ReaderLocationPayload, ReaderSearchResult, ReaderSettings } from "../../types/readerBackendTypes";

export type ReaderPresentationMode = "paged" | "scroll";
export type ReaderPlatformLayout = "desktop" | "mobile";

export interface ReaderSurfaceState {
  currentPage: number;
  totalPages: number;
  pageLabel: string;
  chapterLabel: string;
  progressPercent: number;
  pagesLeftLabel: string;
  visibleText: string;
  locationPayload?: ReaderLocationPayload;
}

export interface ReaderSurfaceHandle {
  prev: () => void;
  next: () => void;
  goToPage: (page: number) => void;
  goToSearchResult: (result: ReaderSearchResult) => void;
  goToTocTarget?: (target: { href?: string; page?: number; sectionIndex?: number }) => void;
}

export interface ReaderSurfaceCommonProps {
  settings: ReaderSettings;
  onSaveLocation: (payload: ReaderLocationPayload) => void;
  onStateChange: (state: ReaderSurfaceState) => void;
  onSelection?: (text: string) => void;
  onContextMenuRequest?: () => void;
  showFocusPreview?: boolean;
  searchQuery?: string;
  onOpenContents?: () => void;
  presentationMode: ReaderPresentationMode;
  platformLayout: ReaderPlatformLayout;
}

export const PLAY_BOOKS_FONTS = [
  {
    label: "Original",
    value: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
  },
  { label: "Sans", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Literata", value: "'Literata', Georgia, serif" },
  { label: "Merriweather", value: "'Merriweather', Georgia, serif" },
] as const;

export const PLAY_BOOKS_THEMES = [
  { label: "Light", value: "light", background: "#f4f3fb", paper: "#ffffff", text: "#171717" },
  { label: "Warm", value: "sepia", background: "#f5efe2", paper: "#f8f0df", text: "#3a2f20" },
  { label: "Dark", value: "dark", background: "#050505", paper: "#050505", text: "#f3f4f6" },
] as const;

export function getReaderTheme(settings: ReaderSettings) {
  const selected =
    PLAY_BOOKS_THEMES.find((theme) => theme.value === settings.theme) ||
    PLAY_BOOKS_THEMES[0];

  return {
    shellBackground: selected.background,
    paperBackground: selected.paper,
    paperText: selected.text,
    slider: settings.theme === "dark" ? "#526db4" : "#5670b5",
    railText: settings.theme === "dark" ? "#d6d9e1" : "#545a66",
    overlay: settings.nightLight ? "rgba(255, 183, 77, 0.10)" : "transparent",
    brightness: Math.min(130, Math.max(55, Number(settings.brightness || 100))) / 100,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeAlignment(
  alignment: ReaderSettings["alignment"],
): "left" | "justify" {
  return alignment === "left" ? "left" : "justify";
}
