import type {
  ReaderAnnotation,
  ReaderLocationPayload,
  ReaderSearchResult,
  ReaderSettings,
  TocItem,
} from "../../types/readerBackendTypes";

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

export interface ReaderSelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ReaderSelectionPayload {
  text: string;
  rect?: ReaderSelectionRect | null;
  anchor?: Record<string, any>;
  annotationId?: string;
  kind: "selection" | "temp-highlight";
  phase: "draft" | "final";
  source: "touch" | "mouse";
}

export type ReaderTapZone = "left" | "center" | "right";

export interface ReaderNoteMarker {
  annotation: ReaderAnnotation;
  rect: ReaderSelectionRect;
}

export interface ReaderSurfaceInteractionState {
  lockNavigation?: boolean;
  scale?: number;
  selectionInProgress?: boolean;
  tempHighlightReady?: boolean;
}

export interface ReaderSurfaceHandle {
  prev: () => void;
  next: () => void;
  goToPage: (page: number) => void;
  goToSearchResult: (result: ReaderSearchResult) => void;
  goToTocTarget?: (target: { href?: string; page?: number; sectionIndex?: number }) => void;
  clearSelection?: (options?: { preserveTemporary?: boolean }) => void;
}

export interface ReaderSurfaceCommonProps {
  settings: ReaderSettings;
  onSaveLocation: (payload: ReaderLocationPayload) => void;
  onStateChange: (state: ReaderSurfaceState) => void;
  onSelection?: (payload: ReaderSelectionPayload) => void;
  annotations?: ReaderAnnotation[];
  onAnnotationPress?: (annotation: ReaderAnnotation, rect: ReaderSelectionRect | null) => void;
  onVisibleNoteMarkersChange?: (markers: ReaderNoteMarker[]) => void;
  onInteractionStateChange?: (state: ReaderSurfaceInteractionState) => void;
  onContextMenuRequest?: () => void;
  onTapZoneRequest?: (zone: ReaderTapZone) => void;
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

export function getReaderUiPalette(settings: ReaderSettings) {
  const baseTheme = getReaderTheme(settings);
  const isDark = settings.theme === "dark";
  const isSepia = settings.theme === "sepia";

  return {
    shell: baseTheme.shellBackground,
    overlayBackdrop: isDark ? "rgba(2, 6, 12, 0.34)" : "rgba(10, 17, 28, 0.12)",
    overlayBackground: isDark ? "#0d1015" : isSepia ? "#f3ead9" : "#f4f3fb",
    surface: isDark ? "#171a20" : isSepia ? "#fbf5ea" : "#ffffff",
    surfaceMuted: isDark ? "#12151b" : isSepia ? "#f1e5cf" : "#eef0fa",
    surfaceSoft: isDark ? "rgba(255,255,255,0.06)" : isSepia ? "#f4ead6" : "#f7f8fc",
    border: isDark ? "rgba(255,255,255,0.12)" : isSepia ? "rgba(98,78,50,0.18)" : "rgba(0,0,0,0.08)",
    borderStrong: isDark ? "rgba(255,255,255,0.18)" : isSepia ? "rgba(98,78,50,0.28)" : "rgba(136,142,156,0.35)",
    textPrimary: isDark ? "#f3f4f6" : isSepia ? "#3a2f20" : "#202124",
    textSecondary: isDark ? "#d6d9e1" : isSepia ? "#6f5b41" : "#5f6368",
    iconPrimary: isDark ? "#f3f4f6" : isSepia ? "#3a2f20" : "#202124",
    iconSecondary: isDark ? "#d6d9e1" : isSepia ? "#7b664e" : "#49515e",
    accent: "#5670b5",
    accentText: "#ffffff",
    accentSoft: isDark ? "rgba(86,112,181,0.18)" : "rgba(86,112,181,0.12)",
    paper: baseTheme.paperBackground,
    paperText: baseTheme.paperText,
    inputBackground: isDark ? "#111318" : isSepia ? "#fffaf1" : "#ffffff",
    inputBorder: isDark ? "rgba(255,255,255,0.12)" : isSepia ? "rgba(98,78,50,0.18)" : "rgba(0,0,0,0.10)",
    pillBackground: isDark ? "rgba(255,255,255,0.08)" : isSepia ? "rgba(58,47,32,0.08)" : "rgba(255,255,255,0.72)",
    pillShadow: isDark ? "0 6px 16px rgba(0,0,0,0.18)" : "0 6px 16px rgba(15,23,42,0.08)",
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

export function annotationHasAttachedNote(annotation: ReaderAnnotation) {
  return (
    annotation.kind === "note" ||
    Boolean(String(annotation.note || "").trim()) ||
    Boolean(String(annotation.anchor?.linked_note_id || "").trim())
  );
}

function getNestedTocItems(item: Record<string, any>) {
  if (Array.isArray(item?.subitems)) return item.subitems;
  if (Array.isArray(item?.children)) return item.children;
  if (Array.isArray(item?.items)) return item.items;
  return [];
}

export function flattenReaderToc<T extends Record<string, any>>(
  tocData: T[] | null | undefined,
): Array<T & TocItem> {
  const flattened: Array<T & TocItem> = [];
  const seen = new Set<string>();

  const walk = (items: T[] | null | undefined, depth: number) => {
    (items || []).forEach((item) => {
      const label = String(item?.label || item?.title || "").trim();
      const href = String(item?.href || "").trim();

      if (href && !seen.has(href)) {
        seen.add(href);
        flattened.push({
          ...item,
          label: label || href,
          href,
          depth,
        });
      }

      const nested = getNestedTocItems(item);
      if (nested.length) {
        walk(nested, depth + 1);
      }
    });
  };

  walk(tocData, 0);
  return flattened;
}
