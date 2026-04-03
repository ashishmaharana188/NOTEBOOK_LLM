import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { IonIcon } from "@ionic/react";
import {
  addOutline,
  arrowBackOutline,
  bookmarkOutline,
  chevronDownOutline,
  closeOutline,
  copyOutline,
  createOutline,
  ellipsisVerticalOutline,
  menuSharp,
  removeOutline,
  reorderThreeOutline,
  menuOutline,
  searchOutline,
  sparklesOutline,
  swapVerticalOutline,
  textOutline,
  languageOutline,
} from "ionicons/icons";
import type {
  MainReaderProps,
  ReaderAnnotation,
  ReaderSearchResult,
  TocItem,
} from "../../types/readerBackendTypes";
import { useReaderSession } from "../../hooks/reader/useReaderSession";
import { useReaderSetting } from "../../hooks/reader/useReaderSetting";
import { API_BASE_URL } from "../../lib/runtimeConfig";
import PlayBooksTextSurface from "./PlayBooksTextSurface";
import PlayBooksPdfSurface from "./PlayBooksPdfSurface";
import PlayBooksEpubSurface from "./PlayBooksEpubSurface";
import {
  clamp,
  getReaderTheme,
  PLAY_BOOKS_FONTS,
  PLAY_BOOKS_THEMES,
  type ReaderPlatformLayout,
  type ReaderPresentationMode,
  type ReaderSurfaceHandle,
  type ReaderSurfaceState,
} from "./playBooksReaderShared";

const API = axios.create({
  baseURL: API_BASE_URL,
});

const SEARCH_STORAGE_KEY = "reader_search_recents_v1";
const PRESENTATION_STORAGE_KEY = "reader_presentation_mode_v1";
const HIGHLIGHT_COLORS = [
  { key: "amber", swatch: "#f7c948" },
  { key: "orange", swatch: "#ff7448" },
  { key: "green", swatch: "#8ac650" },
  { key: "blue", swatch: "#37c5dd" },
] as const;
const LANGUAGE_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Spanish", value: "es" },
];

type OverlayMode =
  | null
  | "contents"
  | "search"
  | "settings"
  | "translate"
  | "define"
  | "note"
  | "ask-rag";

type ContentsTab = "chapters" | "bookmarks" | "notes";

interface SelectionState {
  text: string;
  color: string;
}

interface DefineResult {
  term: string;
  phonetic?: string;
  summary?: string;
  definitions?: Array<{
    part_of_speech?: string;
    definition?: string;
    example?: string;
  }>;
}

interface TranslateResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  provider?: string;
}

const DEFAULT_SURFACE_STATE: ReaderSurfaceState = {
  currentPage: 1,
  totalPages: 1,
  pageLabel: "Page 1",
  chapterLabel: "",
  progressPercent: 0,
  pagesLeftLabel: "",
  visibleText: "",
};

function IconButton({
  icon,
  label,
  onClick,
  active = false,
  theme = "light",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  theme?: "light" | "dark" | "sepia";
}) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[24px] transition ${
        active
          ? isDark
            ? "bg-white/12 text-white shadow-[0_6px_16px_rgba(0,0,0,0.24)] backdrop-blur-sm"
            : "bg-white/70 text-[#5069ad] shadow-[0_6px_16px_rgba(15,23,42,0.08)] backdrop-blur-sm"
          : isDark
            ? "text-white hover:bg-white/10 hover:shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
            : "text-[#202124] hover:bg-white/55 hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
      }`}
    >
      <IonIcon icon={icon} />
    </button>
  );
}

function ReaderSheet({
  title,
  open,
  onClose,
  children,
  widthClass = "max-w-[480px]",
  placement = "bottom",
  theme = "light",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  placement?: "center" | "bottom" | "top-right";
  theme?: "light" | "dark" | "sepia";
}) {
  if (!open) return null;
  const isDark = theme === "dark";
  const placementClass =
    placement === "top-right"
      ? "items-start justify-end px-3 pt-20 sm:px-6 sm:pt-24"
      : placement === "center"
        ? "items-center justify-center px-3 pb-3 pt-20 sm:px-6 sm:pb-8"
        : "items-end justify-center px-3 pb-3 pt-20 sm:px-6 sm:pb-8";
  return (
    <div data-reader-overlay="true" className={`absolute inset-0 z-[80] flex bg-black/10 ${placementClass}`}>
      <style>{`
        .reader-sheet-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
          overscroll-behavior: contain;
        }
        .reader-sheet-scroll::-webkit-scrollbar,
        .reader-font-strip::-webkit-scrollbar {
          display: none;
        }
        .reader-font-strip {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
      `}</style>
      <div
        className={`w-full ${widthClass} overflow-hidden rounded-[10px] shadow-[0_10px_18px_rgba(15,23,42,0.10)]`}
        style={{
          border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(136,142,156,0.45)",
          background: isDark ? "#171a20" : "#eef0fa",
          color: isDark ? "#f3f4f6" : "#202124",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 sm:px-5"
          style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(136,142,156,0.35)" }}
        >
          <div className="text-[1.16rem] font-normal tracking-[-0.03em] sm:text-[1.22rem]">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[1.1rem] hover:bg-black/5"
            style={{ color: isDark ? "#f3f4f6" : "#4b5563" }}
            aria-label="Close"
          >
            <IonIcon icon={closeOutline} />
          </button>
        </div>
        <div
          className="reader-sheet-scroll max-h-[58vh] overflow-y-auto px-4 py-3.5 sm:px-5 sm:py-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function TakeoverScreen({
  title,
  open,
  onClose,
  children,
  theme = "light",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  theme?: "light" | "dark" | "sepia";
}) {
  if (!open) return null;
  const isDark = theme === "dark";
  return (
    <div
      data-reader-overlay="true"
      className="absolute inset-0 z-[70]"
      style={{ background: isDark ? "#0d1015" : "#f4f3fb", color: isDark ? "#f3f4f6" : "#202124" }}
    >
      <div className="flex h-full flex-col">
        <div
          className="flex items-center gap-3 px-5 py-5 sm:px-8"
          style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.10)" }}
        >
          <IconButton icon={arrowBackOutline} label="Back" onClick={onClose} theme={theme} />
          <div className="min-w-0 text-[2.1rem] font-normal tracking-[-0.05em]">
            <div className="truncate">{title}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ReaderListRow({
  icon,
  title,
  subtitle,
  body,
  accent = "#5772b7",
  onClick,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string | undefined;
  body?: ReactNode | undefined;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-5 border-b border-black/8 px-6 py-6 text-left transition hover:bg-black/[0.02] sm:px-10"
    >
      <div className="pt-2 text-[26px]" style={{ color: accent }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[1rem] font-medium uppercase tracking-[-0.01em] text-[#202124]">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-[1.02rem] text-[#5f6368]">{subtitle}</div>
        ) : null}
        {body ? <div className="mt-5 text-[1.05rem] leading-8 text-[#202124]">{body}</div> : null}
      </div>
    </button>
  );
}

function ReaderSelectionMenu({
  open,
  color,
  onColor,
  onAddNote,
  onDefine,
  onTranslate,
  onCopy,
  onSearch,
  onFindEchoes,
  onAskRag,
  theme = "light",
}: {
  open: boolean;
  color: string;
  onColor: (color: string) => void;
  onAddNote: () => void;
  onDefine: () => void;
  onTranslate: () => void;
  onCopy: () => void;
  onSearch: () => void;
  onFindEchoes: () => void;
  onAskRag: () => void;
  theme?: "light" | "dark" | "sepia";
}) {
  if (!open) return null;
  const isDark = theme === "dark";
  return (
    <div
      data-reader-overlay="true"
      className="absolute bottom-24 left-3 z-[75] w-[248px] overflow-hidden rounded-[10px] shadow-[0_10px_18px_rgba(15,23,42,0.10)] sm:bottom-28 sm:left-8"
      style={{
        border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(136,142,156,0.4)",
        background: isDark ? "#171a20" : "#eef0fa",
        color: isDark ? "#f3f4f6" : "#202124",
      }}
    >
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(136,142,156,0.35)" }}
      >
          {HIGHLIGHT_COLORS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onColor(chip.key)}
            className={`h-8 w-8 rounded-full border-[3px] transition ${
              color === chip.key ? "border-white ring-2 ring-current" : "border-transparent"
            }`}
            style={{ backgroundColor: chip.swatch, color: chip.swatch }}
            aria-label={`Highlight ${chip.key}`}
          />
        ))}
      </div>
      <div className="flex flex-col py-2">
        {[
          { icon: createOutline, label: "Add note", action: onAddNote },
          { icon: textOutline, label: "Define", action: onDefine },
          { icon: languageOutline, label: "Translate", action: onTranslate },
          { icon: copyOutline, label: "Copy", action: onCopy },
          { icon: searchOutline, label: "Search", action: onSearch },
          { icon: sparklesOutline, label: "Find Echoes", action: onFindEchoes },
          { icon: sparklesOutline, label: "Ask RAG", action: onAskRag },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className="flex items-center gap-3 px-4 py-3 text-left text-[0.92rem] hover:bg-black/[0.03]"
            style={{ color: isDark ? "#f3f4f6" : "#202124" }}
          >
            <IonIcon
              icon={item.icon}
              className="text-[1.35rem]"
              style={{ color: isDark ? "#f3f4f6" : "#49515e" }}
            />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function cleanRecentQueries(value: string[]) {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))).slice(0, 8);
}

export default function Reader({
  book,
  onFindEchoes,
  onAskRag,
  onBack,
}: MainReaderProps) {
  const surfaceRef = useRef<ReaderSurfaceHandle | null>(null);
  const wheelDeltaRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hideChromeTimeoutRef = useRef<number | null>(null);
  const pageTurnTimeoutRef = useRef<number | null>(null);
  const modeHydratedRef = useRef<string | null>(null);
  const {
    isBootstrapping,
    manifest,
    session,
    annotations,
    readerLocation,
    currentTextSection,
    loadedTextSections,
    usesSectionReader,
    reportLocation,
    refreshBootstrap,
    setCurrentTextSection,
    createBookmark,
    jumpToAnnotation,
  } = useReaderSession(book);
  const { settings, updateSetting } = useReaderSetting();
  const [chromeVisible, setChromeVisible] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [presentationMode, setPresentationMode] = useState<ReaderPresentationMode>("paged");
  const [overlay, setOverlay] = useState<OverlayMode>(null);
  const [settingsTab, setSettingsTab] = useState<"text" | "lighting">("text");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [contentsTab, setContentsTab] = useState<ContentsTab>("chapters");
  const [surfaceState, setSurfaceState] = useState<ReaderSurfaceState>(DEFAULT_SURFACE_STATE);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_STORAGE_KEY);
      return raw ? cleanRecentQueries(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  });
  const [defineResult, setDefineResult] = useState<DefineResult | null>(null);
  const [defineLoading, setDefineLoading] = useState(false);
  const [translateState, setTranslateState] = useState<TranslateResult | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateSourceLanguage, setTranslateSourceLanguage] = useState("auto");
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState("en");
  const [translateInputText, setTranslateInputText] = useState("");
  const [translateMode, setTranslateMode] = useState<"selection" | "page">("selection");
  const [noteDraft, setNoteDraft] = useState("");
  const [activeNote, setActiveNote] = useState<ReaderAnnotation | null>(null);
  const [ragPrompt, setRagPrompt] = useState("");
  const [pageTurnDirection, setPageTurnDirection] = useState<"prev" | "next" | null>(null);

  useEffect(() => {
    return () => {
      if (pageTurnTimeoutRef.current) {
        window.clearTimeout(pageTurnTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(recentQueries));
  }, [recentQueries]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 900px), (pointer: coarse)");
    const syncLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
    };
    syncLayout();
    mediaQuery.addEventListener?.("change", syncLayout);
    window.addEventListener("resize", syncLayout);
    return () => {
      mediaQuery.removeEventListener?.("change", syncLayout);
      window.removeEventListener("resize", syncLayout);
    };
  }, []);

  useEffect(() => {
    if (!book?.filename) return;
    modeHydratedRef.current = null;
    try {
      const raw = localStorage.getItem(`${PRESENTATION_STORAGE_KEY}:${book.filename}`);
      if (raw === "paged" || raw === "scroll") {
        setPresentationMode(raw);
        return;
      }
    } catch {
      // Ignore local preference failures.
    }
    setPresentationMode("paged");
  }, [book?.filename]);

  useEffect(() => {
    if (!book?.filename || modeHydratedRef.current === book.filename) return;
    const persistedMode = session?.view_state?.presentationMode;
    if (persistedMode === "paged" || persistedMode === "scroll") {
      setPresentationMode(persistedMode);
      modeHydratedRef.current = book.filename;
      return;
    }
    if (session) {
      modeHydratedRef.current = book.filename;
    }
  }, [book?.filename, session]);

  useEffect(() => {
    if (isMobileLayout && presentationMode !== "paged") {
      setPresentationMode("paged");
    }
  }, [isMobileLayout, presentationMode]);

  useEffect(() => {
    if (!book?.filename || isMobileLayout) return;
    try {
      localStorage.setItem(`${PRESENTATION_STORAGE_KEY}:${book.filename}`, presentationMode);
    } catch {
      // Ignore local preference failures.
    }
  }, [book?.filename, isMobileLayout, presentationMode]);

  useEffect(() => {
    if (hideChromeTimeoutRef.current) {
      window.clearTimeout(hideChromeTimeoutRef.current);
    }
    if (!chromeVisible || overlay || selection || overflowOpen) {
      return undefined;
    }
    hideChromeTimeoutRef.current = window.setTimeout(() => {
      setChromeVisible(false);
    }, isMobileLayout ? 2200 : 2600);
    return () => {
      if (hideChromeTimeoutRef.current) {
        window.clearTimeout(hideChromeTimeoutRef.current);
      }
    };
  }, [chromeVisible, isMobileLayout, overlay, overflowOpen, selection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlay || selection) return;
      if (event.key === "ArrowRight") {
        surfaceRef.current?.next();
      }
      if (event.key === "ArrowLeft") {
        surfaceRef.current?.prev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [overlay, selection]);

  useEffect(() => {
    if (overlay || selection) {
      setOverflowOpen(false);
    }
  }, [overlay, selection]);

  if (!book) {
    return <div className="flex h-full items-center justify-center text-gray-400">Loading book…</div>;
  }

  const activeTextSection = loadedTextSections[currentTextSection] || null;
  const ext = String(book.extension || "").toLowerCase().replace(/^\./, "");
  const supportsDesktopScroll = false;
  const platformLayout: ReaderPlatformLayout = isMobileLayout ? "mobile" : "desktop";
  const effectivePresentationMode: ReaderPresentationMode = "paged";
  const noteAnnotations = annotations.filter((annotation) => annotation.kind === "note");
  const bookmarkAnnotations = annotations.filter((annotation) => annotation.kind === "bookmark");
  const tocItems = manifest?.toc?.length
    ? manifest.toc
    : manifest?.section_index?.length
      ? manifest.section_index.map((section) => ({
          label: section.label || `Section ${section.section_index + 1}`,
          sectionIndex: section.section_index,
          href: section.href || "",
        }))
      : ([] as Array<TocItem & { page?: number; sectionIndex?: number }>);
  const surfaceTheme = getReaderTheme(settings);
  const readerShellBackground =
    platformLayout === "desktop" ? surfaceTheme.paperBackground : surfaceTheme.shellBackground;
  const chromePrimary = settings.theme === "dark" ? "#f3f4f6" : "#202124";
  const chromeSecondary = settings.theme === "dark" ? "#d6d9e1" : "#5f6368";
  const chromePanelBackground = settings.theme === "dark" ? "#171a20" : "#ffffff";
  const chromePanelBorder = settings.theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const currentLocationPayload = surfaceState.locationPayload || {
    location: readerLocation || 0,
    locationType: "",
    progressPercent: surfaceState.progressPercent,
    pageLabel: surfaceState.pageLabel,
    viewState: {
      presentationMode: effectivePresentationMode,
      platformLayout,
    },
  };
  const savedSectionIndex = (() => {
    const explicit = Number(session?.view_state?.sectionIndex);
    if (Number.isFinite(explicit) && explicit >= 0) {
      return explicit;
    }
    if (currentLocationPayload.locationType === "text_section") {
      const fallback = Number(currentLocationPayload.location);
      if (Number.isFinite(fallback) && fallback >= 0) {
        return fallback;
      }
    }
    return 0;
  })();
  const initialPageIndexForSection =
    savedSectionIndex === currentTextSection
      ? Math.max(0, Number(session?.view_state?.pageIndex || 0))
      : 0;
  const showReaderChrome = chromeVisible || !!overlay || !!selection || overflowOpen;
  const showDesktopPagedEdges =
    platformLayout === "desktop" && effectivePresentationMode === "paged";
  const showDesktopFocusPreview =
    platformLayout === "desktop" &&
    effectivePresentationMode === "paged" &&
    showReaderChrome;
  const handleSaveLocation = useCallback(
    (payload: any) => {
      reportLocation({
        ...payload,
        viewState: {
          ...(payload?.viewState || {}),
          presentationMode: effectivePresentationMode,
          platformLayout,
        },
      });
    },
    [effectivePresentationMode, platformLayout, reportLocation],
  );

  useEffect(() => {
    updateSetting("flow", "paginated");
  }, [updateSetting]);

  const closeSelection = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const openContents = (tab: ContentsTab) => {
    setContentsTab(tab);
    setOverlay("contents");
    setOverflowOpen(false);
    setChromeVisible(true);
    closeSelection();
  };

  const handleSurfaceSelection = (text: string) => {
    if (!text.trim()) return;
    setOverflowOpen(false);
    setSelection((prev) => ({
      text,
      color: prev?.color || "amber",
    }));
    setChromeVisible(true);
  };

  const runSearch = async (queryArg?: string) => {
    const query = String(queryArg ?? searchQuery).trim();
    if (!query) return;
    setSearchQuery(query);
    setSearchLoading(true);
    try {
      const response = await API.post(`/reader/books/${encodeURIComponent(book.filename)}/search`, {
        lid: book.lid || "",
        query,
        limit: 40,
      });
      const results = Array.isArray(response.data?.data?.results)
        ? response.data.data.results
        : [];
      setSearchResults(results);
      setActiveSearchQuery(query);
      setRecentQueries((prev) => cleanRecentQueries([query, ...prev]));
    } catch (error) {
      console.error("Reader search failed", error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const openSearch = async (prefill?: string) => {
    const query = String(prefill || searchQuery || "").trim();
    setSearchQuery(query);
    setOverlay("search");
    setOverflowOpen(false);
    setChromeVisible(true);
    if (query) {
      await runSearch(query);
    }
  };

  const openDefine = async () => {
    if (!selection?.text) return;
    setOverlay("define");
    setOverflowOpen(false);
    setDefineLoading(true);
    try {
      const response = await API.post("/reader/define", {
        term: selection.text,
        context: surfaceState.visibleText,
        language: "en",
      });
      setDefineResult(response.data?.data || null);
    } catch (error) {
      console.error("Reader define failed", error);
      setDefineResult(null);
    } finally {
      setDefineLoading(false);
    }
  };

  const runTranslate = async (
    inputText: string,
    nextSource = translateSourceLanguage,
    nextTarget = translateTargetLanguage,
    mode = translateMode,
  ) => {
    const payloadText = String(inputText || "").trim();
    if (!payloadText) return;
    setTranslateLoading(true);
    try {
      const response = await API.post("/reader/translate", {
        text: payloadText,
        source_language: nextSource,
        target_language: nextTarget,
        mode,
        context: mode === "selection" ? surfaceState.visibleText : "",
      });
      setTranslateState(response.data?.data || null);
    } catch (error) {
      console.error("Reader translate failed", error);
      setTranslateState(null);
    } finally {
      setTranslateLoading(false);
    }
  };

  const openTranslate = async (mode: "selection" | "page") => {
    const text = mode === "selection" ? selection?.text || "" : surfaceState.visibleText || "";
    if (!text.trim()) return;
    setTranslateMode(mode);
    setTranslateInputText(text);
    setOverlay("translate");
    setOverflowOpen(false);
    await runTranslate(text, translateSourceLanguage, translateTargetLanguage, mode);
  };

  const copySelection = async () => {
    if (!selection?.text) return;
    try {
      await navigator.clipboard.writeText(selection.text);
    } catch (error) {
      console.error("Copy failed", error);
    }
    closeSelection();
  };

  const buildReaderNoteContent = (quoteText: string, noteText: string) =>
    `${quoteText ? `> ${quoteText}\n\n` : ""}${noteText}`.trim();

  const saveNote = async () => {
    const quoteText = activeNote?.quote_text || selection?.text || "";
    if (!quoteText && !noteDraft.trim()) return;

    const noteTitle = surfaceState.chapterLabel || quoteText.slice(0, 64) || book.title;
    const baseAnchor = {
      location: currentLocationPayload.location,
      location_type: currentLocationPayload.locationType || "",
      view_state: currentLocationPayload.viewState || {},
      progress_percent: currentLocationPayload.progressPercent || 0,
      page_label: surfaceState.pageLabel,
      chapter_label: surfaceState.chapterLabel,
    };

    try {
      let linkedNoteId =
        typeof activeNote?.anchor?.linked_note_id === "string"
          ? activeNote.anchor.linked_note_id
          : "";

      if (linkedNoteId) {
        await API.put("/notes/item/update", {
          note_id: linkedNoteId,
          title: noteTitle,
          content: buildReaderNoteContent(quoteText, noteDraft),
          tags: "reader",
          group_id: null,
        });
      } else {
        const noteResponse = await API.post("/notes/item/create", {
          group_id: null,
          title: noteTitle,
          content: buildReaderNoteContent(quoteText, noteDraft),
          tags: "reader",
          linked_echo_id: null,
        });
        linkedNoteId = String(noteResponse.data?.note_id || "");
      }

      if (activeNote) {
        await API.put(`/reader/annotations/${activeNote.annotation_id}`, {
          anchor: { ...(activeNote.anchor || {}), ...baseAnchor, linked_note_id: linkedNoteId },
          quote_text: quoteText,
          title: noteTitle,
          note: noteDraft,
          color: selection?.color || activeNote.color || "amber",
          kind: "note",
          page_label: surfaceState.pageLabel,
          chapter_label: surfaceState.chapterLabel,
        });
      } else {
        await API.post(`/reader/books/${encodeURIComponent(book.filename)}/annotations`, {
          lid: book.lid || "",
          format: book.extension || "",
          anchor: { ...baseAnchor, linked_note_id: linkedNoteId },
          quote_text: quoteText,
          title: noteTitle,
          note: noteDraft,
          color: selection?.color || "amber",
          kind: "note",
          page_label: surfaceState.pageLabel,
          chapter_label: surfaceState.chapterLabel,
        });
      }

      await refreshBootstrap();
      setOverlay(null);
      setActiveNote(null);
      setNoteDraft("");
      closeSelection();
    } catch (error) {
      console.error("Reader note save failed", error);
    }
  };

  const deleteNoteRecord = async () => {
    if (!activeNote) return;
    try {
      const linkedNoteId = String(activeNote.anchor?.linked_note_id || "");
      if (linkedNoteId) {
        await API.delete(`/notes/item/${linkedNoteId}`);
      }
      await API.delete(`/reader/annotations/${activeNote.annotation_id}`);
      await refreshBootstrap();
      setOverlay(null);
      setActiveNote(null);
      setNoteDraft("");
      closeSelection();
    } catch (error) {
      console.error("Reader note delete failed", error);
    }
  };

  const openNewNote = () => {
    if (!selection?.text) return;
    setActiveNote(null);
    setNoteDraft("");
    setOverflowOpen(false);
    setOverlay("note");
  };

  const openExistingNote = (annotation: ReaderAnnotation) => {
    jumpToAnnotation(annotation);
    setActiveNote(annotation);
    setNoteDraft(annotation.note || "");
    setSelection({
      text: annotation.quote_text || "",
      color: annotation.color || "amber",
    });
    setOverflowOpen(false);
    setOverlay("note");
  };

  const handleFindEchoes = () => {
    if (!selection?.text || !onFindEchoes) return;
    onFindEchoes(selection.text);
    closeSelection();
  };

  const handleAskRag = () => {
    if (!selection?.text) return;
    setRagPrompt("");
    setOverflowOpen(false);
    setOverlay("ask-rag");
  };

  const handleAddBookmark = async () => {
    setOverflowOpen(false);
    if (!selection?.text.trim()) {
      await createBookmark();
      return;
    }

    try {
      await API.post(`/reader/books/${encodeURIComponent(book.filename)}/annotations`, {
        lid: book.lid || "",
        format: book.extension || "",
        anchor: {
          location: currentLocationPayload.location,
          location_type: currentLocationPayload.locationType || "",
          view_state: currentLocationPayload.viewState || {},
          progress_percent: currentLocationPayload.progressPercent || 0,
        },
        quote_text: selection.text.trim(),
        title: surfaceState.chapterLabel || surfaceState.pageLabel || book.title,
        note: "",
        color: selection.color || "amber",
        kind: "bookmark",
        page_label: surfaceState.pageLabel || "",
        chapter_label: surfaceState.chapterLabel || "",
      });
      await refreshBootstrap();
      closeSelection();
    } catch (error) {
      console.error("Reader bookmark save failed", error);
    }
  };

  const submitRag = () => {
    if (!selection?.text || !ragPrompt.trim() || !onAskRag) return;
    onAskRag(selection.text, ragPrompt.trim());
    setOverlay(null);
    closeSelection();
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (overlay || selection) return;
    wheelDeltaRef.current = 0;
  };

  const triggerPageTurn = useCallback((direction: "prev" | "next", action: () => void) => {
    if (pageTurnTimeoutRef.current) {
      window.clearTimeout(pageTurnTimeoutRef.current);
    }
    setPageTurnDirection(direction);
    window.setTimeout(() => {
      action();
    }, 48);
    pageTurnTimeoutRef.current = window.setTimeout(() => {
      setPageTurnDirection(null);
      pageTurnTimeoutRef.current = null;
    }, 320);
  }, []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || overlay || selection) return;
    if (effectivePresentationMode !== "paged") {
      touchStartRef.current = null;
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        triggerPageTurn("next", () => surfaceRef.current?.next());
      } else {
        triggerPageTurn("prev", () => surfaceRef.current?.prev());
      }
    }
    touchStartRef.current = null;
  };

  const renderSurface = () => {
    if (ext === "pdf") {
      return (
        <PlayBooksPdfSurface
          key={`${book.filename}:pdf:${effectivePresentationMode}`}
          ref={surfaceRef}
          book={book}
          initialLocation={readerLocation}
          onSaveLocation={handleSaveLocation}
          onStateChange={setSurfaceState}
          onSelection={handleSurfaceSelection}
          searchQuery={activeSearchQuery}
          showFocusPreview={showDesktopFocusPreview}
          presentationMode={effectivePresentationMode}
          platformLayout={platformLayout}
          settings={settings}
        />
      );
    }

    if (ext === "epub" && !usesSectionReader) {
      return (
        <PlayBooksEpubSurface
          ref={surfaceRef}
          book={book}
          initialLocation={readerLocation}
          onSaveLocation={handleSaveLocation}
          onStateChange={setSurfaceState}
          onSelection={handleSurfaceSelection}
          onContextMenuRequest={() => {
            if (platformLayout === "desktop") {
              setChromeVisible((prev) => !prev);
            }
          }}
          searchQuery={activeSearchQuery}
          showFocusPreview={showDesktopFocusPreview}
          onOpenContents={() => openContents("chapters")}
          presentationMode={effectivePresentationMode}
          platformLayout={platformLayout}
          settings={settings}
        />
      );
    }

    return (
      <PlayBooksTextSurface
        key={`${book.filename}:text:${effectivePresentationMode}`}
        ref={surfaceRef}
        content={activeTextSection?.content || ""}
        initialLocation={readerLocation}
        currentSectionIndex={currentTextSection}
        sectionCount={manifest?.section_index?.length || 0}
        sectionLabel={activeTextSection?.label || surfaceState.chapterLabel}
        sections={manifest?.section_index || []}
        initialPageIndex={initialPageIndexForSection}
        isLoading={
          isBootstrapping ||
          (usesSectionReader && !manifest) ||
          manifest?.status === "building" ||
          (usesSectionReader && manifest?.status !== "error" && !activeTextSection)
        }
        onNavigateSection={(sectionIndex) => {
          setCurrentTextSection(
            clamp(sectionIndex, 0, Math.max((manifest?.section_index?.length || 1) - 1, 0)),
          );
        }}
        onSaveLocation={handleSaveLocation}
        onStateChange={setSurfaceState}
        onSelection={handleSurfaceSelection}
        searchQuery={activeSearchQuery}
        showFocusPreview={showDesktopFocusPreview}
        onOpenContents={() => openContents("chapters")}
        presentationMode={effectivePresentationMode}
        platformLayout={platformLayout}
        settings={settings}
      />
    );
  };

  const handleResultJump = (result: ReaderSearchResult) => {
    surfaceRef.current?.goToSearchResult(result);
    setOverlay(null);
    setActiveSearchQuery(searchQuery);
    closeSelection();
  };

  const handleContentsJump = (item: any) => {
    surfaceRef.current?.goToTocTarget?.({
      href: item.href,
      page: item.page,
      sectionIndex: item.sectionIndex,
    });
    setOverlay(null);
  };

  const pagesLeftText =
    surfaceState.pagesLeftLabel ||
    `${Math.max(surfaceState.totalPages - surfaceState.currentPage, 0)} pages left`;
  const sliderValue = clamp(surfaceState.currentPage, 1, Math.max(surfaceState.totalPages, 1));

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: readerShellBackground,
        filter: `brightness(${surfaceTheme.brightness})`,
        fontFamily: "'Google Sans', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("[data-reader-chrome='true']") ||
          target.closest("[data-reader-overlay='true']")
        ) {
          return;
        }
        if (platformLayout === "desktop") {
          event.preventDefault();
          setChromeVisible((prev) => !prev);
        }
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("[data-reader-chrome='true']") ||
          target.closest("[data-reader-overlay='true']")
        ) {
          return;
        }
        if (selection) {
          closeSelection();
          return;
        }
        if (overflowOpen) {
          setOverflowOpen(false);
          return;
        }
        if (!isMobileLayout) {
          if (overlay) {
            setOverlay(null);
            return;
          }
          if (chromeVisible) {
            setChromeVisible(false);
          }
          return;
        }
        if (isMobileLayout) {
          setChromeVisible((prev) => !prev);
          return;
        }
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: surfaceTheme.overlay }}
      />

      <div
        data-reader-chrome="true"
        className={`absolute inset-x-0 top-0 z-20 px-3 pt-2 transition duration-200 sm:px-6 sm:pt-4 ${
          showReaderChrome ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton icon={arrowBackOutline} label="Back" onClick={() => onBack?.()} theme={settings.theme} />
            <div className="min-w-0" style={{ color: chromePrimary }}>
              <div className="truncate text-[1.45rem] font-normal tracking-[-0.045em] sm:text-[1.65rem]">
                {book.title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton icon={searchOutline} label="Search" onClick={() => void openSearch()} theme={settings.theme} />
            <IconButton
              icon={textOutline}
              label="Text settings"
              active={overlay === "settings"}
              theme={settings.theme}
              onClick={() => {
                setOverflowOpen(false);
                setSettingsTab("text");
                setOverlay((prev) => (prev === "settings" ? null : "settings"));
              }}
            />
            <IconButton
              icon={ellipsisVerticalOutline}
              label="More"
              active={overflowOpen}
              theme={settings.theme}
              onClick={() => setOverflowOpen((prev) => !prev)}
            />
          </div>
        </div>
        {overflowOpen ? (
          <div
            className="ml-auto mt-3 w-[210px] overflow-hidden rounded-[12px] shadow-[0_10px_20px_rgba(15,23,42,0.10)]"
            style={{ border: `1px solid ${chromePanelBorder}`, background: chromePanelBackground }}
          >
            <button
              type="button"
              onClick={() => void handleAddBookmark()}
              className="flex w-full items-center gap-4 px-4 py-3 text-left text-[0.9rem] hover:bg-black/[0.03]"
              style={{ color: chromePrimary }}
            >
              <IonIcon icon={bookmarkOutline} className="text-xl" style={{ color: chromeSecondary }} />
              <span>Add bookmark</span>
            </button>
            <button
              type="button"
              onClick={() => void openTranslate("page")}
              className="flex w-full items-center gap-4 px-4 py-3 text-left text-[0.9rem] hover:bg-black/[0.03]"
              style={{ color: chromePrimary }}
            >
              <IonIcon icon={languageOutline} className="text-xl" style={{ color: chromeSecondary }} />
              <span>Translate page</span>
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="relative z-[5] h-full transition-[transform,opacity] duration-200 ease-out"
        style={{
          transform:
            pageTurnDirection === "next"
              ? "translateX(-18px) scale(0.992)"
              : pageTurnDirection === "prev"
                ? "translateX(18px) scale(0.992)"
                : "translateX(0) scale(1)",
          opacity: pageTurnDirection ? 0.992 : 1,
        }}
      >
        {renderSurface()}
      </div>

      <div
        className={`pointer-events-none absolute inset-y-0 z-[6] hidden transition-all duration-300 ease-out md:block ${
          pageTurnDirection ? "opacity-100" : "opacity-0"
        }`}
        style={{
          width: "34%",
          left: pageTurnDirection === "prev" ? 0 : "auto",
          right: pageTurnDirection === "next" ? 0 : "auto",
          transform:
            pageTurnDirection === "next"
              ? "translateX(12%) skewX(-4deg)"
              : pageTurnDirection === "prev"
                ? "translateX(-12%) skewX(4deg)"
                : "translateX(0)",
          background:
            pageTurnDirection === "next"
              ? "linear-gradient(to left, rgba(255,255,255,0.44), rgba(255,255,255,0.12), transparent)"
              : pageTurnDirection === "prev"
                ? "linear-gradient(to right, rgba(255,255,255,0.44), rgba(255,255,255,0.12), transparent)"
                : "transparent",
          boxShadow:
            pageTurnDirection === "next"
              ? "-24px 0 30px rgba(15,23,42,0.08)"
              : pageTurnDirection === "prev"
                ? "24px 0 30px rgba(15,23,42,0.08)"
                : "none",
        }}
      />

      <div
        data-reader-chrome="true"
        className={`absolute inset-x-0 bottom-0 z-20 px-3 pb-4 transition duration-200 sm:px-6 sm:pb-5 ${
          showReaderChrome ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-4" style={{ color: chromePrimary }}>
          <div className="text-center text-[1.05rem] tracking-[-0.03em]" style={{ color: chromeSecondary }}>
            {pagesLeftText}
          </div>
          <div className="flex w-full items-center gap-4">
            <IconButton icon={menuOutline} label="Contents" onClick={() => openContents("chapters")} />
            <input
              type="range"
              min={1}
              max={Math.max(surfaceState.totalPages, 1)}
              value={sliderValue}
              onChange={(event) => {
                surfaceRef.current?.goToPage(Number(event.target.value));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#bfc8ec] accent-[#5670b5]"
            />
            <div className="min-w-[88px] text-right text-[1.1rem] tracking-[-0.03em]" style={{ color: chromePrimary }}>
              {surfaceState.currentPage} / {surfaceState.totalPages}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous page"
        data-reader-chrome="true"
        className={`absolute inset-y-0 left-0 z-10 hidden w-[10%] cursor-pointer md:block ${showDesktopPagedEdges ? "" : "pointer-events-none opacity-0"}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          triggerPageTurn("prev", () => surfaceRef.current?.prev());
        }}
      />
      <button
        type="button"
        aria-label="Next page"
        data-reader-chrome="true"
        className={`absolute inset-y-0 right-0 z-10 hidden w-[10%] cursor-pointer md:block ${showDesktopPagedEdges ? "" : "pointer-events-none opacity-0"}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          triggerPageTurn("next", () => surfaceRef.current?.next());
        }}
      />
      <TakeoverScreen
        title={book.title}
        open={overlay === "contents"}
        onClose={() => setOverlay(null)}
        theme={settings.theme}
      >
        <div className="mx-auto w-full max-w-[980px]">
          <div className="flex items-center justify-center gap-10 border-b border-black/10 px-6 pt-4 sm:px-10">
            {(["chapters", "bookmarks", "notes"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setContentsTab(tab)}
                className={`border-b-[4px] px-2 pb-4 text-[1.1rem] tracking-[-0.03em] ${
                  contentsTab === tab
                    ? "border-[#5670b5] text-[#5670b5]"
                    : "border-transparent text-[#202124]"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {contentsTab === "chapters" ? (
            <div>
              {tocItems.map((item: any, index) => (
                <ReaderListRow
                  key={`${item.href || item.label}-${index}`}
                  icon={
                    <span
                      className={`mt-2 inline-block h-3.5 w-3.5 rounded-full ${
                        index === 0 ? "bg-[#5670b5]" : "bg-black/18"
                      }`}
                    />
                  }
                  title={item.label || `Chapter ${index + 1}`}
                  subtitle={
                    index === 0
                      ? `currently on ${surfaceState.pageLabel.toLowerCase()}`
                      : item.page
                        ? `page ${item.page}`
                        : undefined
                  }
                  onClick={() => handleContentsJump(item)}
                />
              ))}
            </div>
          ) : null}

          {contentsTab === "bookmarks" ? (
            <div>
              {bookmarkAnnotations.length === 0 ? (
                <div className="px-10 py-14 text-lg text-[#5f6368]">No bookmarks yet.</div>
              ) : (
                bookmarkAnnotations.map((annotation) => (
                  <ReaderListRow
                    key={annotation.annotation_id}
                    icon={<IonIcon icon={bookmarkOutline} />}
                    title={
                      annotation.title ||
                      annotation.chapter_label ||
                      annotation.page_label
                    }
                    subtitle={`at ${annotation.page_label || annotation.chapter_label || "current page"}`}
                    body={annotation.quote_text ? <span>{annotation.quote_text}</span> : undefined}
                    accent="#5f6368"
                    onClick={() => {
                      jumpToAnnotation(annotation);
                      setOverlay(null);
                    }}
                  />
                ))
              )}
            </div>
          ) : null}

          {contentsTab === "notes" ? (
            <div>
              {noteAnnotations.length === 0 ? (
                <div className="px-10 py-14 text-lg text-[#5f6368]">No reader notes yet.</div>
              ) : (
                noteAnnotations.map((annotation) => (
                  <ReaderListRow
                    key={annotation.annotation_id}
                    icon={<IonIcon icon={createOutline} />}
                    title={annotation.title || annotation.chapter_label || "Reader note"}
                    subtitle={`at ${annotation.page_label || annotation.chapter_label || "current page"}`}
                    body={
                      <span className="bg-[#f5d97a] px-1">
                        {annotation.quote_text || annotation.note || "Open note"}
                      </span>
                    }
                    accent="#c99812"
                    onClick={() => openExistingNote(annotation)}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      </TakeoverScreen>

      <TakeoverScreen title="Search in book" open={overlay === "search"} onClose={() => setOverlay(null)} theme={settings.theme}>
        <div className="mx-auto flex h-full w-full max-w-[980px] flex-col">
          <div className="px-6 py-4 sm:px-10">
            <div className="flex items-center gap-4 rounded-[16px] bg-white px-6 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
              <IonIcon icon={searchOutline} className="text-2xl text-[#5f6368]" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void runSearch();
                  }
                }}
                placeholder="Search in book"
                className="w-full bg-transparent text-[1.3rem] outline-none placeholder:text-[#9aa0a6]"
              />
            </div>
          </div>

          {!searchQuery.trim() && recentQueries.length ? (
            <div className="px-6 pb-4 sm:px-10">
              <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                {recentQueries.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void openSearch(item)}
                    className="flex w-full items-center justify-between px-10 py-6 text-left text-[1.2rem] text-[#202124] hover:bg-black/[0.02]"
                  >
                    <span>{item}</span>
                    <IonIcon
                      icon={arrowBackOutline}
                      className="rotate-[135deg] text-[1.8rem] text-[#5f6368]"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 sm:px-10">
            {searchLoading ? (
              <div className="py-8 text-lg text-[#5f6368]">Searching…</div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-lg text-[#5f6368]">No matches yet.</div>
            ) : (
              <div className="space-y-5">
                {searchResults.map((result) => (
                  <button
                    key={result.result_id}
                    type="button"
                    onClick={() => handleResultJump(result)}
                    className="w-full rounded-[16px] bg-white px-8 py-6 text-left shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                  >
                    <div className="text-[1.15rem] font-semibold text-[#202124]">
                      {result.label || result.page_label || `Result ${result.result_id}`}
                    </div>
                    <div className="mt-2 text-[1rem] text-[#5f6368]">
                      {result.page ? `page ${result.page}` : result.page_label || ""}
                    </div>
                    <div className="mt-4 text-[1.2rem] leading-9 text-[#202124]">
                      <mark className="bg-[#f3dd73] px-1">{result.snippet}</mark>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </TakeoverScreen>

      <ReaderSheet
        title="Aa"
        open={overlay === "settings"}
        onClose={() => setOverlay(null)}
        widthClass="max-w-[360px]"
        placement={isMobileLayout ? "center" : "top-right"}
        theme={settings.theme}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-10 border-b border-black/10 pb-2.5">
            <button
              type="button"
              onClick={() => setSettingsTab("text")}
              className={`border-b-[4px] px-2 pb-2.5 text-[1.08rem] ${
                settingsTab === "text"
                  ? "border-[#5670b5] text-[#5670b5]"
                  : "border-transparent text-[#5f6368]"
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab("lighting")}
              className={`border-b-[4px] px-2 pb-2.5 text-[1.08rem] ${
                settingsTab === "lighting"
                  ? "border-[#5670b5] text-[#5670b5]"
                  : "border-transparent text-[#5f6368]"
              }`}
            >
              Lighting
            </button>
          </div>

          {settingsTab === "text" ? (
            <>
              <div className="reader-font-strip overflow-x-auto pb-1">
                <div className="flex min-w-max gap-4 pr-4">
                  {PLAY_BOOKS_FONTS.map((font) => (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() => updateSetting("fontFamily", font.value)}
                      className="flex flex-col items-center gap-2 text-[#202124]"
                    >
                      <span
                        className={`flex h-[64px] w-[64px] items-center justify-center rounded-full border text-[2.55rem] ${
                          settings.fontFamily === font.value
                            ? "border-[#5670b5] bg-[#5670b5] text-white"
                            : "border-black/25 bg-white"
                        }`}
                        style={{ fontFamily: font.value }}
                      >
                        A
                      </span>
                      <span className="text-[0.8rem]">{font.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-3">
                <button
                  type="button"
                  onClick={() => updateSetting("fontSize", clamp(settings.fontSize - 10, 80, 180))}
                  className="flex h-[58px] items-center justify-center rounded-[8px] border border-black/18 bg-white text-[#202124]"
                  aria-label="Smaller text"
                >
                  <span className="text-[1.9rem] font-semibold leading-none">T</span>
                </button>
                <div className="text-center text-[0.94rem] text-[#5f6368]">
                  {Math.round((settings.fontSize / 100) * 100)}%
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("fontSize", clamp(settings.fontSize + 10, 80, 180))}
                  className="flex h-[58px] items-center justify-center rounded-[8px] border border-black/18 bg-white text-[#202124]"
                  aria-label="Larger text"
                >
                  <span className="text-[2.35rem] font-semibold leading-none">T</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateSetting("lineHeight", clamp(settings.lineHeight - 0.1, 1.3, 2.2))}
                  className="flex h-[58px] items-center justify-center gap-1 rounded-[8px] border border-black/18 bg-white text-[#202124]"
                  aria-label="Tighter spacing"
                >
                  <IonIcon icon={swapVerticalOutline} className="text-[1.15rem]" />
                  <IonIcon icon={reorderThreeOutline} className="text-[1.45rem]" />
                </button>
                <div className="text-center text-[0.94rem] text-[#5f6368]">
                  {Math.round((settings.lineHeight / 1.6) * 100)}%
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting("lineHeight", clamp(settings.lineHeight + 0.1, 1.3, 2.2))}
                  className="flex h-[58px] items-center justify-center gap-1 rounded-[8px] border border-black/18 bg-white text-[#202124]"
                  aria-label="Looser spacing"
                >
                  <IonIcon icon={swapVerticalOutline} className="text-[1.15rem]" />
                  <IonIcon icon={menuOutline} className="text-[1.45rem]" />
                </button>
              </div>

          {ext === "pdf" && platformLayout === "desktop" ? (
            <div className="space-y-2">
              <div className="text-[0.78rem] font-medium uppercase tracking-[0.18em] text-[#5f6368]">
                Page Layout
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateSetting("spread", "none")}
                  className={`rounded-[8px] border px-3.5 py-2 text-[0.86rem] ${
                    settings.spread !== "always"
                      ? "border-[#5670b5] bg-[#5670b5] text-white"
                      : "border-black/20 bg-white text-[#202124]"
                  }`}
                >
                  Single page
                </button>
                <button
                  type="button"
                  onClick={() => updateSetting("spread", "always")}
                  className={`rounded-[8px] border px-3.5 py-2 text-[0.86rem] ${
                    settings.spread === "always"
                      ? "border-[#5670b5] bg-[#5670b5] text-white"
                      : "border-black/20 bg-white text-[#202124]"
                  }`}
                >
                  Two-page
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3 rounded-[8px] border border-black/12 bg-white px-3.5 py-3">
            <IonIcon icon={menuSharp} className="text-[1.35rem] text-[#5f6368]" />
            <div className="flex-1 text-[0.9rem] text-[#202124]">
              {settings.alignment === "left"
                ? "Left"
                : settings.alignment === "justify"
                  ? "Justify"
                  : "Default"}
            </div>
            <select
              value={settings.alignment || "default"}
              onChange={(event) =>
                updateSetting("alignment", event.target.value as "default" | "left" | "justify")
              }
              className="bg-transparent text-[0.9rem] text-[#202124] outline-none"
            >
              <option value="default">Default</option>
              <option value="left">Left</option>
              <option value="justify">Justify</option>
            </select>
            <IonIcon icon={chevronDownOutline} className="text-xl text-[#5f6368]" />
          </div>
            </>
          ) : null}

          {settingsTab === "lighting" ? (
          <div className="space-y-4">
            <div className="text-[0.96rem] text-[#202124]">Reading brightness</div>
            <input
              type="range"
              min={55}
              max={130}
              value={settings.brightness || 100}
              onChange={(event) => updateSetting("brightness", Number(event.target.value))}
              className="w-full accent-[#5670b5]"
            />
            <div className="text-[0.96rem] text-[#202124]">Viewing theme</div>
            <div className="grid grid-cols-3 gap-3">
              {PLAY_BOOKS_THEMES.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  onClick={() => updateSetting("theme", theme.value)}
                    className={`h-12 rounded-[6px] border ${
                      settings.theme === theme.value ? "border-[#202124]" : "border-black/10"
                    }`}
                  style={{ backgroundColor: theme.paper }}
                  aria-label={theme.label}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="text-[0.96rem] text-[#202124]">Reading Night Light</div>
                <button
                  type="button"
                  onClick={() => updateSetting("nightLight", !settings.nightLight)}
                  className={`relative h-9 w-16 rounded-full transition ${
                    settings.nightLight ? "bg-[#5670b5]" : "bg-black/20"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-7 w-7 rounded-full bg-white transition ${
                      settings.nightLight ? "left-[32px]" : "left-[4px]"
                    }`}
                  />
                </button>
            </div>
          </div>
          ) : null}
        </div>
      </ReaderSheet>

      <ReaderSheet
        title="Translate"
        open={overlay === "translate"}
        onClose={() => setOverlay(null)}
        widthClass="max-w-[372px]"
        placement="bottom"
        theme={settings.theme}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-[1px] overflow-hidden border border-black/18 bg-[#b8bdcc]">
            <select
              value={translateSourceLanguage}
              onChange={(event) => {
                const value = event.target.value;
                setTranslateSourceLanguage(value);
                void runTranslate(translateInputText, value, translateTargetLanguage, translateMode);
              }}
              className="bg-[#eef0fa] px-4 py-3 text-[0.96rem] text-[#202124] outline-none"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={translateTargetLanguage}
              onChange={(event) => {
                const value = event.target.value;
                setTranslateTargetLanguage(value);
                void runTranslate(translateInputText, translateSourceLanguage, value, translateMode);
              }}
              className="bg-[#eef0fa] px-4 py-3 text-[0.96rem] text-[#202124] outline-none"
            >
              {LANGUAGE_OPTIONS.filter((option) => option.value !== "auto").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-[180px] border border-black/12 bg-white px-4 py-4 text-[0.96rem] leading-7 text-[#202124]">
            {translateLoading ? "Translating…" : translateState?.translated_text || "No translation yet."}
          </div>
        </div>
      </ReaderSheet>

      <ReaderSheet
        title={defineResult?.term || "Define"}
        open={overlay === "define"}
        onClose={() => setOverlay(null)}
        widthClass="max-w-[372px]"
        placement="bottom"
        theme={settings.theme}
      >
        <div className="space-y-5 text-[#202124]">
          {defineLoading ? (
            <div className="text-lg text-[#5f6368]">Looking up definition…</div>
          ) : defineResult ? (
            <>
              {defineResult.phonetic ? (
                <div className="text-[1rem] text-[#5f6368]">{defineResult.phonetic}</div>
              ) : null}
              {defineResult.summary ? (
                <div className="text-[1.15rem] leading-8">{defineResult.summary}</div>
              ) : null}
              <div className="space-y-4 text-[0.98rem] leading-7">
                {(defineResult.definitions || []).map((item, index) => (
                  <div key={`${item.definition}-${index}`}>
                    {item.part_of_speech ? <div className="font-medium">{item.part_of_speech}</div> : null}
                    <div>{item.definition}</div>
                    {item.example ? <div className="mt-1 text-[#5f6368]">{item.example}</div> : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-lg text-[#5f6368]">No definition available.</div>
          )}
        </div>
      </ReaderSheet>

      {overlay === "note" ? (
        <div
          data-reader-overlay="true"
          className="absolute inset-0 z-[80] flex items-end justify-center bg-black/10 px-3 pb-3 pt-20 sm:px-6 sm:pb-8"
        >
          <div
            className="w-full max-w-[388px] overflow-hidden rounded-[10px] shadow-[0_10px_18px_rgba(15,23,42,0.10)]"
            style={{
              border:
                settings.theme === "dark"
                  ? "1px solid rgba(255,255,255,0.12)"
                  : "1px solid rgba(136,142,156,0.35)",
              background: settings.theme === "dark" ? "#171a20" : "#eef0fa",
            }}
          >
            <div className="px-4 pt-5">
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add note"
                className="min-h-[250px] w-full resize-none bg-transparent px-0 py-0 text-[1rem] leading-7 text-[#202124] outline-none placeholder:text-[#9aa0a6]"
              />
            </div>
            <div className="px-4 pb-5 pt-2">
              <div className="flex items-center gap-5 pb-5">
                {HIGHLIGHT_COLORS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() =>
                      setSelection((prev) =>
                        prev
                          ? {
                              ...prev,
                              color: chip.key,
                            }
                          : {
                              text: activeNote?.quote_text || "",
                              color: chip.key,
                            },
                      )
                    }
                    className={`h-10 w-10 rounded-full border-4 ${
                      (selection?.color || activeNote?.color || "amber") === chip.key
                        ? "border-white ring-2 ring-current"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: chip.swatch, color: chip.swatch }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-5">
                <button
                  type="button"
                  onClick={() => {
                    if (activeNote) {
                      void deleteNoteRecord();
                    } else {
                      setOverlay(null);
                      closeSelection();
                    }
                  }}
                  className="rounded-full border border-[#6d7382] bg-white px-6 py-2.5 text-[0.96rem] text-[#5670b5]"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => void saveNote()}
                  className="rounded-full bg-[#5670b5] px-6 py-2.5 text-[0.96rem] text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ReaderSheet
        title="Ask RAG"
        open={overlay === "ask-rag"}
        onClose={() => setOverlay(null)}
        widthClass="max-w-[372px]"
        placement="bottom"
        theme={settings.theme}
      >
        <div className="space-y-5">
          <div className="rounded-[12px] bg-white px-5 py-4 text-[0.96rem] leading-7 text-[#5f6368]">
            {selection?.text}
          </div>
          <textarea
            value={ragPrompt}
            onChange={(event) => setRagPrompt(event.target.value)}
            placeholder="What should I analyze from this passage?"
            className="min-h-[112px] w-full resize-none rounded-[12px] border border-black/10 bg-white px-4 py-4 text-[0.96rem] leading-7 text-[#202124] outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submitRag}
              className="rounded-full bg-[#5670b5] px-7 py-2.5 text-[0.96rem] text-white"
            >
              Ask RAG
            </button>
          </div>
        </div>
      </ReaderSheet>

      <ReaderSelectionMenu
        open={!!selection && overlay === null}
        color={selection?.color || "amber"}
        theme={settings.theme}
        onColor={(color) =>
          setSelection((prev) => (prev ? { ...prev, color } : prev))
        }
        onAddNote={openNewNote}
        onDefine={() => void openDefine()}
        onTranslate={() => void openTranslate("selection")}
        onCopy={() => void copySelection()}
        onSearch={() => void openSearch(selection?.text || "")}
        onFindEchoes={handleFindEchoes}
        onAskRag={handleAskRag}
      />
    </div>
  );
}
