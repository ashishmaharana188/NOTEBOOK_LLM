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
    documentTextOutline,
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
    annotationHasAttachedNote,
    clamp,
    getReaderTheme,
    getReaderUiPalette,
    PLAY_BOOKS_FONTS,
    PLAY_BOOKS_THEMES,
    type ReaderNoteMarker,
    type ReaderPlatformLayout,
    type ReaderPresentationMode,
    type ReaderSurfaceInteractionState,
    type ReaderSelectionPayload,
    type ReaderSelectionRect,
    type ReaderSurfaceHandle,
    type ReaderSurfaceState,
    type ReaderTapZone,
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
    rect?: ReaderSelectionRect | null;
    anchor?: Record<string, any>;
    annotationId?: string;
    kind: "selection" | "temp-highlight";
    phase: "draft" | "final";
    source: "touch" | "mouse";
}

interface SelectionSnapshot {
    text: string;
    color: string;
    rect?: ReaderSelectionRect | null;
    anchor?: Record<string, any>;
    annotationId?: string;
    kind: "selection" | "temp-highlight";
    phase: "draft" | "final";
    source: "touch" | "mouse";
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
    compact = false,
}: {
    icon: string;
    label: string;
    onClick: () => void;
    active?: boolean;
    theme?: "light" | "dark" | "sepia";
    compact?: boolean;
}) {
    const palette = getReaderUiPalette({
        theme,
        fontSize: 100,
        fontFamily: "",
        lineHeight: 1.6,
        pageMargin: 0,
        flow: "paginated",
        spread: "none",
        alignment: "default",
        brightness: 100,
        nightLight: false,
    });
    const isDark = theme === "dark";
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex items-center justify-center rounded-[14px] transition ${
                compact ? "h-9 w-9 text-[22px]" : "h-10 w-10 text-[24px]"
            } ${
                active
                    ? isDark
                        ? "bg-white/12 text-white shadow-[0_6px_16px_rgba(0,0,0,0.24)] backdrop-blur-sm"
                        : "shadow-[0_6px_16px_rgba(15,23,42,0.08)] backdrop-blur-sm"
                    : isDark
                        ? "text-white hover:bg-white/10 hover:shadow-[0_6px_16px_rgba(0,0,0,0.18)]"
                        : "hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
            }`}
            style={
                active
                    ? {
                          background: isDark ? "rgba(255,255,255,0.12)" : palette.pillBackground,
                          color: isDark ? "#ffffff" : palette.accent,
                      }
                    : !isDark
                      ? {
                            color: palette.iconPrimary,
                        }
                      : undefined
            }
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
    compact = false,
}: {
    title: string;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    widthClass?: string;
    placement?: "center" | "bottom" | "top-right";
    theme?: "light" | "dark" | "sepia";
    compact?: boolean;
}) {
    if (!open) return null;
    const palette = getReaderUiPalette({
        theme,
        fontSize: 100,
        fontFamily: "",
        lineHeight: 1.6,
        pageMargin: 0,
        flow: "paginated",
        spread: "none",
        alignment: "default",
        brightness: 100,
        nightLight: false,
    });
    const placementClass = compact
        ? "items-end justify-center px-0"
        : placement === "top-right"
          ? "items-start justify-end px-3 pt-20 sm:px-6 sm:pt-24"
          : placement === "center"
            ? "items-center justify-center px-3 pb-3 pt-20 sm:px-6 sm:pb-8"
            : "items-end justify-center px-3 pb-3 pt-20 sm:px-6 sm:pb-8";
    return (
        <div
            data-reader-overlay="true"
            className={`absolute inset-0 z-[80] flex ${placementClass}`}
            style={{
                background: palette.overlayBackdrop,
                paddingTop: compact
                    ? "max(12px, calc(env(safe-area-inset-top) + 12px))"
                    : undefined,
                paddingBottom: compact
                    ? "max(0px, env(safe-area-inset-bottom))"
                    : undefined,
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
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
                className={`w-full ${widthClass} overflow-hidden shadow-[0_10px_18px_rgba(15,23,42,0.10)] ${
                    compact ? "rounded-t-[18px]" : "rounded-[10px]"
                }`}
                style={{
                    border: `1px solid ${palette.borderStrong}`,
                    background: palette.surfaceMuted,
                    color: palette.textPrimary,
                    maxWidth: compact ? "100%" : undefined,
                    maxHeight: compact ? "min(82dvh, calc(100dvh - env(safe-area-inset-top) - 12px))" : undefined,
                }}
            >
                <div
                    className="flex items-center justify-between px-4 py-3 sm:px-5"
                    style={{
                        borderBottom: `1px solid ${palette.border}`,
                        paddingTop: compact
                            ? "max(6px, calc(env(safe-area-inset-top) * 0.1))"
                            : undefined,
                    }}
                >
                    <div className="text-[1.16rem] font-normal tracking-[-0.03em] sm:text-[1.22rem]">
                        {title}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[1.1rem] hover:bg-black/5"
                        style={{ color: palette.iconSecondary }}
                        aria-label="Close"
                    >
                        <IonIcon icon={closeOutline} />
                    </button>
                </div>
                <div
                    className={`reader-sheet-scroll overflow-y-auto px-4 py-3.5 sm:px-5 sm:py-4 ${
                        compact ? "max-h-[calc(82dvh-72px)]" : "max-h-[58vh]"
                    }`}
                    style={{
                        WebkitOverflowScrolling: "touch",
                        paddingBottom: compact
                            ? "calc(16px + env(safe-area-inset-bottom))"
                            : undefined,
                    }}
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
    compact = false,
}: {
    title: string;
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    theme?: "light" | "dark" | "sepia";
    compact?: boolean;
}) {
    if (!open) return null;
    const palette = getReaderUiPalette({
        theme,
        fontSize: 100,
        fontFamily: "",
        lineHeight: 1.6,
        pageMargin: 0,
        flow: "paginated",
        spread: "none",
        alignment: "default",
        brightness: 100,
        nightLight: false,
    });
    return (
        <div
            data-reader-overlay="true"
            className="absolute inset-0 z-[70]"
            style={{
                background: palette.overlayBackground,
                color: palette.textPrimary,
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div
                className="flex h-full flex-col"
                style={{
                    paddingTop: compact
                        ? "env(safe-area-inset-top)"
                        : undefined,
                    paddingBottom: compact
                        ? "env(safe-area-inset-bottom)"
                        : undefined,
                }}
            >
                <div
                    className={`flex items-center gap-3 ${compact ? "px-4 py-4" : "px-5 py-5 sm:px-8"}`}
                    style={{
                        borderBottom: `1px solid ${palette.border}`,
                    }}
                >
                    <IconButton
                        icon={arrowBackOutline}
                        label="Back"
                        onClick={onClose}
                        theme={theme}
                        compact={compact}
                    />
                    <div
                        className={`min-w-0 font-normal tracking-[-0.05em] ${
                            compact ? "text-[1.4rem]" : "text-[2.1rem]"
                        }`}
                    >
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
    theme = "light",
}: {
    icon?: ReactNode;
    title: string;
    subtitle?: string | undefined;
    body?: ReactNode | undefined;
    accent?: string;
    onClick?: () => void;
    theme?: "light" | "dark" | "sepia";
}) {
    const palette = getReaderUiPalette({
        theme,
        fontSize: 100,
        fontFamily: "",
        lineHeight: 1.6,
        pageMargin: 0,
        flow: "paginated",
        spread: "none",
        alignment: "default",
        brightness: 100,
        nightLight: false,
    });
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full gap-5 border-b border-black/8 px-6 py-6 text-left transition hover:bg-black/[0.02] sm:px-10"
            style={{ borderBottomColor: palette.border }}
        >
            <div className="pt-2 text-[26px]" style={{ color: accent }}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div
                    className="text-[1rem] font-medium uppercase tracking-[-0.01em]"
                    style={{ color: palette.textPrimary }}
                >
                    {title}
                </div>
                {subtitle ? (
                    <div
                        className="mt-1 text-[1.02rem]"
                        style={{ color: palette.textSecondary }}
                    >
                        {subtitle}
                    </div>
                ) : null}
                {body ? (
                    <div
                        className="mt-5 text-[1.05rem] leading-8"
                        style={{ color: palette.textPrimary }}
                    >
                        {body}
                    </div>
                ) : null}
            </div>
        </button>
    );
}

function ReaderSelectionMenu({
    open,
    color,
    anchorRect,
    onColor,
    onSaveHighlight,
    onClearHighlight,
    onAddNote,
    onDefine,
    onTranslate,
    onCopy,
    onSearch,
    onFindEchoes,
    onAskRag,
    onDeleteHighlight,
    onDismiss,
    hasSavedHighlight,
    isTemporaryHighlight = false,
    theme = "light",
    mobile = false,
}: {
    open: boolean;
    color: string;
    anchorRect?: ReaderSelectionRect | null;
    onColor: (color: string) => void;
    onSaveHighlight: () => void;
    onClearHighlight: () => void;
    onAddNote: () => void;
    onDefine: () => void;
    onTranslate: () => void;
    onCopy: () => void;
    onSearch: () => void;
    onFindEchoes: () => void;
    onAskRag: () => void;
    onDeleteHighlight: () => void;
    onDismiss: () => void;
    hasSavedHighlight: boolean;
    isTemporaryHighlight?: boolean;
    theme?: "light" | "dark" | "sepia";
    mobile?: boolean;
}) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState({ left: 20, top: 20 });
    const panelWidth = 216;
    const palette = getReaderUiPalette({
        theme,
        fontSize: 100,
        fontFamily: "",
        lineHeight: 1.6,
        pageMargin: 0,
        flow: "paginated",
        spread: "none",
        alignment: "default",
        brightness: 100,
        nightLight: false,
    });
    const actions = [
        ...(!hasSavedHighlight && isTemporaryHighlight
            ? [
                  {
                      icon: bookmarkOutline,
                      label: "Save highlight",
                      action: onSaveHighlight,
                  },
                  {
                      icon: closeOutline,
                      label: "Clear",
                      action: onClearHighlight,
                  },
              ]
            : []),
        {
            icon: createOutline,
            label: "Add note",
            action: onAddNote,
        },
        { icon: textOutline, label: "Define", action: onDefine },
        {
            icon: languageOutline,
            label: "Translate",
            action: onTranslate,
        },
        { icon: copyOutline, label: "Copy", action: onCopy },
        { icon: searchOutline, label: "Search", action: onSearch },
        {
            icon: sparklesOutline,
            label: "Find Echoes",
            action: onFindEchoes,
        },
        {
            icon: sparklesOutline,
            label: "Ask RAG",
            action: onAskRag,
        },
        ...(hasSavedHighlight
            ? [
                  {
                      icon: removeOutline,
                      label: "Delete highlight",
                      action: onDeleteHighlight,
                  },
              ]
            : []),
    ];

    useEffect(() => {
        if (!open || mobile) return;
        const updatePosition = () => {
            if (!anchorRect) return;
            const node = panelRef.current;
            const panelHeight = node?.offsetHeight || 360;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const effectivePanelWidth = Math.min(panelWidth, viewportWidth - 24);
            const desiredLeft =
                anchorRect.left + anchorRect.width / 2 - effectivePanelWidth / 2;
            const left = Math.min(
                Math.max(12, desiredLeft),
                Math.max(12, viewportWidth - effectivePanelWidth - 12),
            );
            let top = anchorRect.bottom + 14;
            if (top + panelHeight > viewportHeight - 12) {
                top = Math.max(12, anchorRect.top - panelHeight - 14);
            }
            setPosition({ left, top });
        };

        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [anchorRect, mobile, open, panelWidth]);

    if (!open) return null;
    if (mobile) {
        return (
            <div
                data-reader-overlay="true"
                className="fixed inset-0 z-[75] flex items-end justify-center"
                style={{
                    background: palette.overlayBackdrop,
                    paddingTop: "max(12px, calc(env(safe-area-inset-top) + 12px))",
                    paddingBottom: "env(safe-area-inset-bottom)",
                }}
                onClick={(event) => {
                    if (event.target !== event.currentTarget) return;
                    onDismiss();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                <div
                    className="w-full overflow-hidden rounded-t-[22px] shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
                    style={{
                        border: `1px solid ${palette.borderStrong}`,
                        background: palette.surfaceMuted,
                        color: palette.textPrimary,
                    }}
                >
                    <div
                        className="mx-auto mt-3 h-1.5 w-12 rounded-full"
                        style={{ background: palette.borderStrong }}
                    />
                    <div
                        className="flex items-center justify-start gap-4 px-5 py-3.5"
                        style={{ borderBottom: `1px solid ${palette.border}` }}
                    >
                        {HIGHLIGHT_COLORS.map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => onColor(chip.key)}
                                className={`h-8 w-8 rounded-full border-2 transition ${
                                    color === chip.key
                                        ? "border-white ring-2 ring-current"
                                        : "border-transparent"
                                }`}
                                style={{
                                    backgroundColor: chip.swatch,
                                    color: chip.swatch,
                                }}
                                aria-label={`Highlight ${chip.key}`}
                            />
                        ))}
                    </div>
                    <div
                        className="max-h-[52dvh] overflow-y-auto py-1"
                        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
                    >
                        {actions.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    item.action();
                                }}
                                className="flex w-full items-center gap-3 px-6 py-4 text-left text-[0.98rem] hover:bg-black/[0.03]"
                                style={{ color: palette.textPrimary }}
                            >
                                <IonIcon
                                    icon={item.icon}
                                    className="text-[1.45rem]"
                                    style={{ color: palette.iconSecondary }}
                                />
                                <span className="tracking-[-0.02em]">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    if (!anchorRect) return null;
    return (
        <div
            ref={panelRef}
            data-reader-overlay="true"
            className="fixed z-[75] overflow-hidden rounded-[18px] shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
            style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
                width: `min(${panelWidth}px, calc(100vw - 24px))`,
                border: `1px solid ${palette.borderStrong}`,
                background: palette.surfaceMuted,
                color: palette.textPrimary,
                fontFamily:
                    "'Google Sans', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div
                className="flex items-center justify-start gap-4 px-5 py-3.5"
                style={{
                    borderBottom: `1px solid ${palette.border}`,
                }}
            >
                {HIGHLIGHT_COLORS.map((chip) => (
                    <button
                        key={chip.key}
                        type="button"
                        onClick={() => onColor(chip.key)}
                        className={`h-6 w-6 rounded-full border-2 transition ${
                            color === chip.key
                                ? "border-white ring-2 ring-current"
                                : "border-transparent"
                        }`}
                        style={{
                            backgroundColor: chip.swatch,
                            color: chip.swatch,
                        }}
                        aria-label={`Highlight ${chip.key}`}
                    />
                ))}
            </div>
            <div className="flex flex-col py-1.5">
                {actions.map((item) => (
                    <button
                        key={item.label}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            item.action();
                        }}
                        className="flex items-center gap-3 px-6 py-3 text-left text-[0.94rem] hover:bg-black/[0.03]"
                        style={{ color: palette.textPrimary }}
                    >
                        <IonIcon
                            icon={item.icon}
                            className="text-[1.45rem]"
                            style={{ color: palette.iconSecondary }}
                        />
                        <span className="tracking-[-0.02em]">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function cleanRecentQueries(value: string[]) {
    return Array.from(
        new Set(value.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 8);
}

export default function Reader({
    book,
    onFindEchoes,
    onAskRag,
    onBack,
}: MainReaderProps) {
    const shellRef = useRef<HTMLDivElement | null>(null);
    const surfaceRef = useRef<ReaderSurfaceHandle | null>(null);
    const wheelDeltaRef = useRef(0);
    const hideChromeTimeoutRef = useRef<number | null>(null);
    const modeHydratedRef = useRef<string | null>(null);
    const suppressContextMenuUntilRef = useRef(0);
    const suppressSelectionCloseUntilRef = useRef(0);
    const pendingHighlightKeyRef = useRef("");
    const pendingHighlightPromiseRef = useRef<
        Promise<ReaderAnnotation | null> | null
    >(null);
    const selectionColorRef = useRef("amber");
    const overlayRef = useRef<OverlayMode>(null);
    const overflowOpenRef = useRef(false);
    const selectionOpenRef = useRef(false);
    const platformLayoutRef = useRef<ReaderPlatformLayout>("desktop");
    const suppressTouchTapUntilRef = useRef(0);
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
        createAnnotation,
        updateAnnotation,
        deleteAnnotation,
        jumpToAnnotation,
    } = useReaderSession(book);
    const { settings, updateSetting } = useReaderSetting();
    const [chromeVisible, setChromeVisible] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const [presentationMode, setPresentationMode] =
        useState<ReaderPresentationMode>("paged");
    const [overlay, setOverlay] = useState<OverlayMode>(null);
    const [settingsTab, setSettingsTab] = useState<"text" | "lighting">("text");
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [contentsTab, setContentsTab] = useState<ContentsTab>("chapters");
    const [surfaceState, setSurfaceState] = useState<ReaderSurfaceState>(
        DEFAULT_SURFACE_STATE,
    );
    const [selection, setSelection] = useState<SelectionState | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeSearchQuery, setActiveSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<ReaderSearchResult[]>(
        [],
    );
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
    const [translateState, setTranslateState] =
        useState<TranslateResult | null>(null);
    const [translateLoading, setTranslateLoading] = useState(false);
    const [translateSourceLanguage, setTranslateSourceLanguage] =
        useState("auto");
    const [translateTargetLanguage, setTranslateTargetLanguage] =
        useState("en");
    const [translateInputText, setTranslateInputText] = useState("");
    const [translateMode, setTranslateMode] = useState<"selection" | "page">(
        "selection",
    );
    const [noteDraft, setNoteDraft] = useState("");
    const [activeNote, setActiveNote] = useState<ReaderAnnotation | null>(null);
    const [visibleNoteMarkers, setVisibleNoteMarkers] = useState<
        ReaderNoteMarker[]
    >([]);
    const [ragPrompt, setRagPrompt] = useState("");
    const [surfaceInteraction, setSurfaceInteraction] =
        useState<ReaderSurfaceInteractionState>({
            lockNavigation: false,
            scale: 1,
            selectionInProgress: false,
            tempHighlightReady: false,
        });
    const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
    selectionColorRef.current = selection?.color || selectionColorRef.current;
    overlayRef.current = overlay;
    overflowOpenRef.current = overflowOpen;
    selectionOpenRef.current = Boolean(selection);

    const getLiveSelectionText = useCallback(() => {
        try {
            return window.getSelection?.()?.toString().trim() || "";
        } catch {
            return "";
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(recentQueries));
    }, [recentQueries]);

    const bookExtension = String(book?.extension || "")
        .toLowerCase()
        .replace(/^\./, "");
    const mobilePreferredPresentationMode: ReaderPresentationMode =
        bookExtension === "pdf" ? "paged" : "scroll";

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const mediaQuery = window.matchMedia("(max-width: 900px)");
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
        setSurfaceInteraction({
            lockNavigation: false,
            scale: 1,
            selectionInProgress: false,
            tempHighlightReady: false,
        });
    }, [book?.filename, bookExtension]);

    useEffect(() => {
        if (!book?.filename) return;
        modeHydratedRef.current = null;
        if (isMobileLayout) {
            setPresentationMode(mobilePreferredPresentationMode);
            return;
        }
        try {
            const raw = localStorage.getItem(
                `${PRESENTATION_STORAGE_KEY}:${book.filename}`,
            );
            if (raw === "paged" || raw === "scroll") {
                setPresentationMode(raw);
                return;
            }
        } catch {
            // Ignore local preference failures.
        }
        setPresentationMode("paged");
    }, [book?.filename, isMobileLayout, mobilePreferredPresentationMode]);

    useEffect(() => {
        if (!book?.filename || modeHydratedRef.current === book.filename)
            return;
        const persistedMode = session?.view_state?.presentationMode;
        if (isMobileLayout) {
            setPresentationMode(mobilePreferredPresentationMode);
            modeHydratedRef.current = book.filename;
            return;
        }
        if (persistedMode === "paged" || persistedMode === "scroll") {
            setPresentationMode(persistedMode);
            modeHydratedRef.current = book.filename;
            return;
        }
        if (session) {
            modeHydratedRef.current = book.filename;
        }
    }, [book?.filename, isMobileLayout, mobilePreferredPresentationMode, session]);

    useEffect(() => {
        if (
            isMobileLayout &&
            presentationMode !== mobilePreferredPresentationMode
        ) {
            setPresentationMode(mobilePreferredPresentationMode);
        }
    }, [isMobileLayout, mobilePreferredPresentationMode, presentationMode]);

    useEffect(() => {
        if (!book?.filename || isMobileLayout) return;
        try {
            localStorage.setItem(
                `${PRESENTATION_STORAGE_KEY}:${book.filename}`,
                presentationMode,
            );
        } catch {
            // Ignore local preference failures.
        }
    }, [book?.filename, isMobileLayout, presentationMode]);

    useEffect(() => {
        if (hideChromeTimeoutRef.current) {
            window.clearTimeout(hideChromeTimeoutRef.current);
        }
        if (
            !chromeVisible ||
            overlay ||
            selection ||
            overflowOpen ||
            !isMobileLayout
        ) {
            return undefined;
        }
        hideChromeTimeoutRef.current = window.setTimeout(
            () => {
                setChromeVisible(false);
            },
            isMobileLayout ? 2200 : 2600,
        );
        return () => {
            if (hideChromeTimeoutRef.current) {
                window.clearTimeout(hideChromeTimeoutRef.current);
            }
        };
    }, [chromeVisible, isMobileLayout, overlay, overflowOpen]);

    useEffect(() => {
        if (overlay || selection) {
            setOverflowOpen(false);
        }
    }, [overlay, selection]);

    const triggerPageTurn = useCallback(
        (_direction: "prev" | "next", action: () => void) => {
            action();
        },
        [],
    );

    const turnPrevPage = useCallback(() => {
        triggerPageTurn("prev", () => surfaceRef.current?.prev());
    }, [triggerPageTurn]);

    const turnNextPage = useCallback(() => {
        triggerPageTurn("next", () => surfaceRef.current?.next());
    }, [triggerPageTurn]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (overlay || selection) return;
            if (event.key === "ArrowRight") {
                turnNextPage();
            }
            if (event.key === "ArrowLeft") {
                turnPrevPage();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [overlay, selection, turnNextPage, turnPrevPage]);

    if (!book) {
        return (
            <div className="flex h-full items-center justify-center text-gray-400">
                Loading book…
            </div>
        );
    }

    const activeTextSection = loadedTextSections[currentTextSection] || null;
    const ext = bookExtension;
    const supportsDesktopScroll = false;
    const platformLayout: ReaderPlatformLayout = isMobileLayout
        ? "mobile"
        : "desktop";
    platformLayoutRef.current = platformLayout;
    const effectivePresentationMode: ReaderPresentationMode = isMobileLayout
        ? mobilePreferredPresentationMode === "scroll"
            ? presentationMode
            : "paged"
        : "paged";
    const noteAnnotations = annotations.filter(
        (annotation) => annotation.kind !== "bookmark",
    );
    const bookmarkAnnotations = annotations.filter(
        (annotation) => annotation.kind === "bookmark",
    );
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
    const uiPalette = getReaderUiPalette(settings);
    const readerShellBackground =
        platformLayout === "desktop"
            ? surfaceTheme.paperBackground
            : surfaceTheme.shellBackground;
    const chromePrimary = uiPalette.textPrimary;
    const chromeSecondary = uiPalette.textSecondary;
    const chromePanelBackground = uiPalette.surface;
    const chromePanelBorder = uiPalette.border;
    const initialPdfScaleValue = Number(session?.view_state?.scale);
    const initialPdfScale =
        Number.isFinite(initialPdfScaleValue) && initialPdfScaleValue >= 1
            ? clamp(initialPdfScaleValue, 1, 3)
            : 1;
    const allowTapNavigation =
        !surfaceInteraction.lockNavigation &&
        !surfaceInteraction.selectionInProgress;
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
    const overlayKeepsChromeVisible =
        overlay === "contents" ||
        overlay === "search" ||
        overlay === "settings";
    const showReaderChrome =
        chromeVisible || overlayKeepsChromeVisible || overflowOpen;
    const showDesktopPagedEdges =
        platformLayout === "desktop" && effectivePresentationMode === "paged";
    const showDesktopFocusPreview =
        platformLayout === "desktop" &&
        effectivePresentationMode === "paged" &&
        showReaderChrome;
    const showTopBarTitle = !showDesktopFocusPreview || overlay === "contents";
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

    const closeSelection = useCallback(() => {
        setSelectionMenuOpen(false);
        setSelection(null);
        surfaceRef.current?.clearSelection?.();
        window.getSelection()?.removeAllRanges();
    }, []);

    const handleSurfaceInteractionChange = useCallback(
        (nextState: ReaderSurfaceInteractionState) => {
            setSurfaceInteraction((prev) => ({
                ...prev,
                ...nextState,
            }));
        },
        [],
    );

    const closeNoteOverlay = useCallback(() => {
        setOverlay(null);
        setActiveNote(null);
        setNoteDraft("");
        closeSelection();
    }, [closeSelection]);

    const suppressContextMenu = useCallback((durationMs = 450) => {
        suppressContextMenuUntilRef.current = Date.now() + durationMs;
    }, []);

    const getSelectionKey = useCallback((value: SelectionSnapshot | null) => {
        if (!value?.text?.trim()) return "";
        return JSON.stringify({
            text: value.text.trim(),
            anchor: value.anchor || {},
        });
    }, []);

    const prepareSelectionOverlay = useCallback(() => {
        suppressContextMenu();
        setSelectionMenuOpen(false);
        surfaceRef.current?.clearSelection?.();
        window.getSelection()?.removeAllRanges();
        setOverflowOpen(false);
    }, [suppressContextMenu]);

    const openContents = (tab: ContentsTab) => {
        setContentsTab(tab);
        setOverlay("contents");
        setOverflowOpen(false);
        setChromeVisible(true);
        closeSelection();
    };

    const openExistingNote = useCallback(
        (annotation: ReaderAnnotation, rect: ReaderSelectionRect | null = null) => {
            jumpToAnnotation(annotation);
            setActiveNote(annotation);
            setNoteDraft(annotation.note || "");
            setSelection({
                text: annotation.quote_text || "",
                color: annotation.color || "amber",
                rect,
                anchor: annotation.anchor || {},
                annotationId: annotation.annotation_id,
                kind: "temp-highlight",
                phase: "final",
                source: "mouse",
            });
            setSelectionMenuOpen(false);
            setOverflowOpen(false);
            setOverlay("note");
        },
        [jumpToAnnotation],
    );

    const handleAnnotationPress = useCallback(
        (annotation: ReaderAnnotation, rect: ReaderSelectionRect | null) => {
            suppressSelectionCloseUntilRef.current = Date.now() + 250;
            if (annotationHasAttachedNote(annotation)) {
                openExistingNote(annotation, rect);
                return;
            }
            setSelection({
                text: annotation.quote_text || "",
                color: annotation.color || "amber",
                rect,
                anchor: annotation.anchor || {},
                annotationId: annotation.annotation_id,
                kind: "temp-highlight",
                phase: "final",
                source: "mouse",
            });
            setSelectionMenuOpen(true);
        },
        [openExistingNote],
    );

    const createHighlightAnnotation = useCallback(
        async (
            color: string,
            targetSelection?: SelectionSnapshot | null,
        ) => {
            const source = targetSelection || selection;
            if (!source?.text?.trim()) return null;
            const anchor = {
                location: currentLocationPayload.location,
                location_type: currentLocationPayload.locationType || "",
                view_state: currentLocationPayload.viewState || {},
                progress_percent: currentLocationPayload.progressPercent || 0,
                ...(source.anchor || {}),
            };
            const created = await createAnnotation({
                anchor,
                quote_text: source.text.trim(),
                title:
                    surfaceState.chapterLabel ||
                    surfaceState.pageLabel ||
                    book.title,
                note: "",
                color,
                kind: "highlight",
                page_label: surfaceState.pageLabel || "",
                chapter_label: surfaceState.chapterLabel || "",
            });
            if (created) {
                const sourceKey = getSelectionKey(source);
                setSelection((prev) =>
                    prev && getSelectionKey(prev) === sourceKey
                        ? {
                              ...prev,
                              color: created.color || color,
                              annotationId: created.annotation_id,
                              anchor: created.anchor || anchor,
                          }
                        : prev,
                );
            }
            return created;
        },
        [
            book?.title,
            createAnnotation,
            currentLocationPayload.location,
            currentLocationPayload.locationType,
            currentLocationPayload.progressPercent,
            currentLocationPayload.viewState,
            getSelectionKey,
            selection,
            surfaceState.chapterLabel,
            surfaceState.pageLabel,
        ],
    );

    const ensureSelectionHighlight = useCallback(
        async (
            targetSelection: SelectionSnapshot | null,
            preferredColor?: string,
        ) => {
            if (!targetSelection?.text?.trim()) return null;
            if (targetSelection.annotationId) {
                if (
                    preferredColor &&
                    preferredColor !== targetSelection.color
                ) {
                    await updateAnnotation(targetSelection.annotationId, {
                        color: preferredColor,
                    });
                    setSelection((prev) =>
                        prev &&
                        prev.annotationId === targetSelection.annotationId
                            ? { ...prev, color: preferredColor }
                            : prev,
                    );
                }
                return (
                    annotations.find(
                        (annotation) =>
                            annotation.annotation_id ===
                            targetSelection.annotationId,
                    ) || null
                );
            }

            const selectionKey = getSelectionKey(targetSelection);
            if (!selectionKey) return null;

            if (
                pendingHighlightPromiseRef.current &&
                pendingHighlightKeyRef.current === selectionKey
            ) {
                const created = await pendingHighlightPromiseRef.current;
                if (
                    created?.annotation_id &&
                    preferredColor &&
                    preferredColor !== created.color
                ) {
                    await updateAnnotation(created.annotation_id, {
                        color: preferredColor,
                    });
                    setSelection((prev) =>
                        prev && getSelectionKey(prev) === selectionKey
                            ? { ...prev, color: preferredColor }
                            : prev,
                    );
                }
                return created;
            }

            pendingHighlightKeyRef.current = selectionKey;
            const request = createHighlightAnnotation(
                preferredColor || targetSelection.color || "amber",
                targetSelection,
            );
            pendingHighlightPromiseRef.current = request;
            try {
                return await request;
            } finally {
                if (pendingHighlightKeyRef.current === selectionKey) {
                    pendingHighlightKeyRef.current = "";
                    pendingHighlightPromiseRef.current = null;
                }
            }
        },
        [
            annotations,
            createHighlightAnnotation,
            getSelectionKey,
            updateAnnotation,
        ],
    );

    const handleSurfaceSelection = useCallback(
        (payload: ReaderSelectionPayload) => {
            const nextText = String(payload?.text || "").trim();
            if (!nextText) {
                setSelectionMenuOpen(false);
                setSelection(null);
                return;
            }
            suppressSelectionCloseUntilRef.current = Date.now() + 250;
            suppressTouchTapUntilRef.current = Date.now() + 350;
            setOverflowOpen(false);
            const nextSelection: SelectionSnapshot = {
                text: nextText,
                color: selectionColorRef.current || "amber",
                rect: payload?.rect || null,
                ...(payload?.anchor ? { anchor: payload.anchor } : {}),
                ...(payload?.annotationId
                    ? { annotationId: payload.annotationId }
                    : {}),
                kind: payload.kind,
                phase: payload.phase,
                source: payload.source,
            };
            setSelectionMenuOpen(
                !isMobileLayout ||
                    Boolean(payload.annotationId) ||
                    (payload.kind === "temp-highlight" &&
                        payload.source === "mouse"),
            );
            setSelection(nextSelection);
            if (
                isMobileLayout &&
                payload.kind === "temp-highlight" &&
                payload.source === "touch" &&
                payload.phase === "final"
            ) {
                window.requestAnimationFrame(() => {
                    surfaceRef.current?.clearSelection?.({
                        preserveTemporary: true,
                    });
                    window.getSelection()?.removeAllRanges();
                });
            }
        },
        [isMobileLayout],
    );

    const handleSurfaceContextMenuRequest = useCallback(() => {
        if (Date.now() < suppressContextMenuUntilRef.current) {
            return;
        }
        if (
            overlayRef.current ||
            overflowOpenRef.current ||
            selectionOpenRef.current ||
            getLiveSelectionText()
        ) {
            return;
        }
        if (platformLayoutRef.current === "desktop") {
            setChromeVisible((prev) => !prev);
        }
    }, [getLiveSelectionText]);

    const handleSelectionColor = useCallback(
        async (color: string) => {
            if (!selection?.text?.trim()) return;
            suppressSelectionCloseUntilRef.current = Date.now() + 250;
            if (
                isMobileLayout &&
                selection.kind === "temp-highlight" &&
                !selection.annotationId
            ) {
                setSelection((prev) => (prev ? { ...prev, color } : prev));
                return;
            }
            if (selection.annotationId) {
                await updateAnnotation(selection.annotationId, { color });
                setSelection((prev) => (prev ? { ...prev, color } : prev));
                surfaceRef.current?.clearSelection?.();
                window.getSelection()?.removeAllRanges();
                return;
            }
            try {
                await ensureSelectionHighlight(selection, color);
                surfaceRef.current?.clearSelection?.();
                window.getSelection()?.removeAllRanges();
            } catch (error) {
                console.error("Reader highlight save failed", error);
            }
        },
        [ensureSelectionHighlight, isMobileLayout, selection, updateAnnotation],
    );

    const deleteSelectedHighlight = useCallback(async () => {
        if (!selection?.annotationId) return;
        const existing = annotations.find(
            (annotation) => annotation.annotation_id === selection.annotationId,
        );
        try {
            const linkedNoteId = String(existing?.anchor?.linked_note_id || "");
            if (linkedNoteId) {
                await API.delete(`/notes/item/${linkedNoteId}`);
            }
            await deleteAnnotation(selection.annotationId);
            closeSelection();
            setOverlay(null);
            setActiveNote(null);
            setNoteDraft("");
        } catch (error) {
            console.error("Reader highlight delete failed", error);
        }
    }, [annotations, deleteAnnotation, selection]);

    const runSearch = async (queryArg?: string) => {
        const query = String(queryArg ?? searchQuery).trim();
        if (!query) return;
        setSearchQuery(query);
        setSearchLoading(true);
        try {
            const response = await API.post(
                `/reader/books/${encodeURIComponent(book.filename)}/search`,
                {
                    lid: book.lid || "",
                    query,
                    limit: 40,
                },
            );
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
        suppressContextMenu();
        if (prefill) {
            prepareSelectionOverlay();
        }
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
        prepareSelectionOverlay();
        setOverlay("define");
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
        const text =
            mode === "selection"
                ? selection?.text || ""
                : surfaceState.visibleText || "";
        if (!text.trim()) return;
        suppressContextMenu();
        if (mode === "selection") {
            prepareSelectionOverlay();
        } else {
            setOverflowOpen(false);
        }
        setTranslateMode(mode);
        setTranslateInputText(text);
        setOverlay("translate");
        await runTranslate(
            text,
            translateSourceLanguage,
            translateTargetLanguage,
            mode,
        );
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

        const noteTitle =
            surfaceState.chapterLabel || quoteText.slice(0, 64) || book.title;
        const baseAnchor = {
            ...(selection?.anchor || {}),
            location: currentLocationPayload.location,
            location_type: currentLocationPayload.locationType || "",
            view_state: currentLocationPayload.viewState || {},
            progress_percent: currentLocationPayload.progressPercent || 0,
            page_label: surfaceState.pageLabel,
            chapter_label: surfaceState.chapterLabel,
        };

        try {
            let selectedAnnotation =
                activeNote ||
                annotations.find(
                    (annotation) =>
                        annotation.annotation_id === selection?.annotationId,
                ) ||
                null;
            if (!selectedAnnotation && selection?.text?.trim()) {
                selectedAnnotation = await ensureSelectionHighlight(
                    selection,
                    selection.color || "amber",
                );
            }

            if (!selectedAnnotation) {
                return;
            }

            const shouldAttachNote = Boolean(noteDraft.trim());
            let linkedNoteId =
                typeof selectedAnnotation?.anchor?.linked_note_id === "string"
                    ? selectedAnnotation.anchor.linked_note_id
                    : "";

            if (shouldAttachNote && linkedNoteId) {
                await API.put("/notes/item/update", {
                    note_id: linkedNoteId,
                    title: noteTitle,
                    content: buildReaderNoteContent(quoteText, noteDraft),
                    tags: "reader",
                    group_id: null,
                });
            } else if (shouldAttachNote) {
                const noteResponse = await API.post("/notes/item/create", {
                    group_id: null,
                    title: noteTitle,
                    content: buildReaderNoteContent(quoteText, noteDraft),
                    tags: "reader",
                    linked_echo_id: null,
                });
                linkedNoteId = String(noteResponse.data?.note_id || "");
            }

            await updateAnnotation(selectedAnnotation.annotation_id, {
                anchor: {
                    ...(selectedAnnotation.anchor || {}),
                    ...baseAnchor,
                    ...(linkedNoteId ? { linked_note_id: linkedNoteId } : {}),
                },
                quote_text: quoteText,
                title: noteTitle,
                note: shouldAttachNote ? noteDraft : "",
                color:
                    selection?.color || selectedAnnotation.color || "amber",
                kind: shouldAttachNote ? "note" : "highlight",
                page_label: surfaceState.pageLabel,
                chapter_label: surfaceState.chapterLabel,
            });
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
            const linkedNoteId = String(
                activeNote.anchor?.linked_note_id || "",
            );
            if (linkedNoteId) {
                await API.delete(`/notes/item/${linkedNoteId}`);
            }
            await deleteAnnotation(activeNote.annotation_id);
            setOverlay(null);
            setActiveNote(null);
            setNoteDraft("");
            closeSelection();
        } catch (error) {
            console.error("Reader note delete failed", error);
        }
    };

    const openNewNote = async () => {
        if (!selection?.text) return;
        const ensuredAnnotation = await ensureSelectionHighlight(
            selection,
            selection.color || "amber",
        );
        prepareSelectionOverlay();
        const existing =
            ensuredAnnotation ||
            annotations.find(
                (annotation) =>
                    annotation.annotation_id === selection.annotationId,
            ) || null;
        setActiveNote(existing);
        setNoteDraft(existing?.note || "");
        setOverlay("note");
    };

    const saveTemporaryHighlight = useCallback(async () => {
        if (!selection?.text?.trim() || selection.annotationId) return;
        try {
            await ensureSelectionHighlight(
                selection,
                selection.color || "amber",
            );
            setSelectionMenuOpen(true);
            surfaceRef.current?.clearSelection?.();
            window.getSelection()?.removeAllRanges();
        } catch (error) {
            console.error("Reader temporary highlight save failed", error);
        }
    }, [ensureSelectionHighlight, selection]);

    const clearTemporaryHighlight = useCallback(() => {
        closeSelection();
    }, [closeSelection]);

    const handleFindEchoes = () => {
        if (!selection?.text || !onFindEchoes) return;
        onFindEchoes(selection.text);
        closeSelection();
    };

    const handleAskRag = () => {
        if (!selection?.text) return;
        prepareSelectionOverlay();
        setRagPrompt("");
        setOverlay("ask-rag");
    };

    const handleAddBookmark = async () => {
        setOverflowOpen(false);
        if (!selection?.text.trim()) {
            await createBookmark();
            return;
        }

        try {
            await createAnnotation({
                anchor: {
                    location: currentLocationPayload.location,
                    location_type:
                        currentLocationPayload.locationType || "",
                    view_state: currentLocationPayload.viewState || {},
                    progress_percent:
                        currentLocationPayload.progressPercent || 0,
                },
                quote_text: selection.text.trim(),
                title:
                    surfaceState.chapterLabel ||
                    surfaceState.pageLabel ||
                    book.title,
                note: "",
                color: selection.color || "amber",
                kind: "bookmark",
                page_label: surfaceState.pageLabel || "",
                chapter_label: surfaceState.chapterLabel || "",
            });
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

    const handleTapZoneRequest = useCallback(
        (zone: ReaderTapZone) => {
            suppressTouchTapUntilRef.current = Date.now() + 350;
            if (overlay) return;
            if (surfaceInteraction.selectionInProgress) {
                return;
            }
            if (selection) {
                if (selection.phase === "draft") {
                    return;
                }
                if (
                    isMobileLayout &&
                    selection.kind === "temp-highlight" &&
                    !selection.annotationId
                ) {
                    if (selectionMenuOpen) {
                        setSelectionMenuOpen(false);
                        return;
                    }
                    closeSelection();
                } else {
                    if (Date.now() >= suppressSelectionCloseUntilRef.current) {
                        closeSelection();
                    }
                    return;
                }
            }
            if (overflowOpen) {
                setOverflowOpen(false);
                return;
            }
            if (!allowTapNavigation && zone !== "center") {
                return;
            }
            if (
                allowTapNavigation &&
                zone === "left" &&
                (isMobileLayout || effectivePresentationMode === "paged")
            ) {
                turnPrevPage();
                return;
            }
            if (
                allowTapNavigation &&
                zone === "right" &&
                (isMobileLayout || effectivePresentationMode === "paged")
            ) {
                turnNextPage();
                return;
            }
            setChromeVisible((prev) => !prev);
        },
        [
            allowTapNavigation,
            closeSelection,
            isMobileLayout,
            effectivePresentationMode,
            overflowOpen,
            overlay,
            selection,
            selectionMenuOpen,
            surfaceInteraction.selectionInProgress,
            turnNextPage,
            turnPrevPage,
        ],
    );

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
                    annotations={annotations}
                    onAnnotationPress={handleAnnotationPress}
                    onVisibleNoteMarkersChange={setVisibleNoteMarkers}
                    onInteractionStateChange={handleSurfaceInteractionChange}
                    onContextMenuRequest={handleSurfaceContextMenuRequest}
                    onTapZoneRequest={handleTapZoneRequest}
                    searchQuery={activeSearchQuery}
                    showFocusPreview={showDesktopFocusPreview}
                    presentationMode={effectivePresentationMode}
                    platformLayout={platformLayout}
                    initialScale={initialPdfScale}
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
                    annotations={annotations}
                    onAnnotationPress={handleAnnotationPress}
                    onVisibleNoteMarkersChange={setVisibleNoteMarkers}
                    onInteractionStateChange={handleSurfaceInteractionChange}
                    onContextMenuRequest={handleSurfaceContextMenuRequest}
                    onTapZoneRequest={handleTapZoneRequest}
                    searchQuery={activeSearchQuery}
                    showFocusPreview={showDesktopFocusPreview}
                    presentationMode={effectivePresentationMode}
                    platformLayout={platformLayout}
                    settings={settings}
                    {...(showDesktopContentsControl
                        ? {
                              onOpenContents: () => openContents("chapters"),
                          }
                        : {})}
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
                sectionLabel={
                    activeTextSection?.label || surfaceState.chapterLabel
                }
                sections={manifest?.section_index || []}
                initialPageIndex={initialPageIndexForSection}
                isLoading={
                    isBootstrapping ||
                    (usesSectionReader && !manifest) ||
                    manifest?.status === "building" ||
                    (usesSectionReader &&
                        manifest?.status !== "error" &&
                        !activeTextSection)
                }
                onNavigateSection={(sectionIndex) => {
                    setCurrentTextSection(
                        clamp(
                            sectionIndex,
                            0,
                            Math.max(
                                (manifest?.section_index?.length || 1) - 1,
                                0,
                            ),
                        ),
                    );
                }}
                onSaveLocation={handleSaveLocation}
                onStateChange={setSurfaceState}
                onSelection={handleSurfaceSelection}
                annotations={annotations}
                onAnnotationPress={handleAnnotationPress}
                onVisibleNoteMarkersChange={setVisibleNoteMarkers}
                onInteractionStateChange={handleSurfaceInteractionChange}
                onTapZoneRequest={handleTapZoneRequest}
                searchQuery={activeSearchQuery}
                showFocusPreview={showDesktopFocusPreview}
                presentationMode={effectivePresentationMode}
                platformLayout={platformLayout}
                settings={settings}
                {...(showDesktopContentsControl
                    ? {
                          onOpenContents: () => openContents("chapters"),
                      }
                    : {})}
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
    const sliderValue = clamp(
        surfaceState.currentPage,
        1,
        Math.max(surfaceState.totalPages, 1),
    );
    const viewportWidth =
        typeof window === "undefined" ? 1440 : window.innerWidth;
    const viewportHeight =
        typeof window === "undefined" ? 900 : window.innerHeight;
    const showDesktopContentsControl =
        platformLayout === "desktop" && viewportWidth > 900;
    const sheetCardStyle = {
        background: uiPalette.surface,
        border: `1px solid ${uiPalette.border}`,
        color: uiPalette.textPrimary,
    } as const;
    const sheetInputStyle = {
        background: uiPalette.inputBackground,
        border: `1px solid ${uiPalette.inputBorder}`,
        color: uiPalette.textPrimary,
    } as const;
    const sheetMutedTextStyle = {
        color: uiPalette.textSecondary,
    } as const;

    return (
        <div
            ref={shellRef}
            className="relative h-full w-full overflow-hidden"
            style={{
                backgroundColor: readerShellBackground,
                filter: `brightness(${surfaceTheme.brightness})`,
                fontFamily:
                    "'Google Sans', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
                touchAction: "manipulation",
            }}
            onWheel={handleWheel}
            onContextMenu={(event) => {
                const target = event.target as HTMLElement;
                if (Date.now() < suppressContextMenuUntilRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                if (overlay || overflowOpen) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                if (target.closest("[data-reader-overlay='true']")) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const liveSelectionText = getLiveSelectionText();
                if (selection || liveSelectionText) {
                    event.preventDefault();
                    return;
                }
                if (target.closest("[data-reader-chrome='true']")) {
                    return;
                }
                if (platformLayout === "desktop") {
                    event.preventDefault();
                    setChromeVisible((prev) => !prev);
                }
            }}
            onClick={(event) => {
                if (Date.now() < suppressTouchTapUntilRef.current) {
                    return;
                }
                if (surfaceInteraction.selectionInProgress) {
                    return;
                }
                const target = event.target as HTMLElement;
                if (
                    target.closest("[data-reader-chrome='true']") ||
                    target.closest("[data-reader-overlay='true']")
                ) {
                    return;
                }
                if (selection) {
                    if (
                        isMobileLayout &&
                        selection.kind === "temp-highlight" &&
                        !selection.annotationId
                    ) {
                        if (selectionMenuOpen) {
                            setSelectionMenuOpen(false);
                        }
                        return;
                    }
                    if (selection.phase === "draft") {
                        return;
                    }
                    if (
                        Date.now() < suppressSelectionCloseUntilRef.current
                    ) {
                        return;
                    }
                    closeSelection();
                    return;
                }
                if (overflowOpen) {
                    setOverflowOpen(false);
                    return;
                }
                if (isMobileLayout) return;
            }}
        >
            <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{ background: surfaceTheme.overlay }}
            />

            <div
                data-reader-chrome="true"
                className={`absolute inset-x-0 top-0 z-20 px-3 pt-2 transition duration-200 sm:px-6 sm:pt-4 ${
                    showReaderChrome
                        ? "opacity-100"
                        : "pointer-events-none opacity-0"
                }`}
                style={{
                    paddingTop: isMobileLayout
                        ? "calc(env(safe-area-inset-top) + 8px)"
                        : undefined,
                }}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <IconButton
                            icon={arrowBackOutline}
                            label="Back"
                            onClick={() => onBack?.()}
                            theme={settings.theme}
                            compact={isMobileLayout}
                        />
                        {showTopBarTitle ? (
                            <div
                                className="min-w-0"
                                style={{ color: chromePrimary }}
                            >
                                <div className="truncate text-[1.12rem] font-normal tracking-[-0.045em] sm:text-[1.65rem]">
                                    {book.title}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                        <IconButton
                            icon={searchOutline}
                            label="Search"
                            onClick={() => void openSearch()}
                            theme={settings.theme}
                            compact={isMobileLayout}
                        />
                        <IconButton
                            icon={textOutline}
                            label="Text settings"
                            active={overlay === "settings"}
                            theme={settings.theme}
                            compact={isMobileLayout}
                            onClick={() => {
                                setOverflowOpen(false);
                                setSettingsTab("text");
                                setOverlay((prev) =>
                                    prev === "settings" ? null : "settings",
                                );
                            }}
                        />
                        <IconButton
                            icon={ellipsisVerticalOutline}
                            label="More"
                            active={overflowOpen}
                            theme={settings.theme}
                            compact={isMobileLayout}
                            onClick={() => setOverflowOpen((prev) => !prev)}
                        />
                    </div>
                </div>
                {overflowOpen ? (
                    <div
                        className="ml-auto mt-3 overflow-hidden rounded-[12px] shadow-[0_10px_20px_rgba(15,23,42,0.10)]"
                        style={{
                            width: isMobileLayout
                                ? "min(210px, calc(100vw - 24px))"
                                : "210px",
                            border: `1px solid ${chromePanelBorder}`,
                            background: chromePanelBackground,
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => void handleAddBookmark()}
                            className="flex w-full items-center gap-4 px-4 py-3 text-left text-[0.9rem] hover:bg-black/[0.03]"
                            style={{ color: chromePrimary }}
                        >
                            <IonIcon
                                icon={bookmarkOutline}
                                className="text-xl"
                                style={{ color: chromeSecondary }}
                            />
                            <span>Add bookmark</span>
                        </button>
                        {isMobileLayout ? (
                            <button
                                type="button"
                                onClick={() => openContents("chapters")}
                                className="flex w-full items-center gap-4 px-4 py-3 text-left text-[0.9rem] hover:bg-black/[0.03]"
                                style={{ color: chromePrimary }}
                            >
                                <IonIcon
                                    icon={menuOutline}
                                    className="text-xl"
                                    style={{ color: chromeSecondary }}
                                />
                                <span>Table of contents</span>
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => void openTranslate("page")}
                            className="flex w-full items-center gap-4 px-4 py-3 text-left text-[0.9rem] hover:bg-black/[0.03]"
                            style={{ color: chromePrimary }}
                        >
                            <IonIcon
                                icon={languageOutline}
                                className="text-xl"
                                style={{ color: chromeSecondary }}
                            />
                            <span>Translate page</span>
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="relative z-[5] h-full">{renderSurface()}</div>

            {isMobileLayout &&
            selection?.kind === "temp-highlight" &&
            !selection.annotationId &&
            !selectionMenuOpen &&
            overlay === null &&
            selection.rect ? (
                <button
                    type="button"
                    data-reader-overlay="true"
                    className="fixed z-[16] rounded-[6px] border shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                    style={{
                        left: `${selection.rect.left}px`,
                        top: `${selection.rect.top}px`,
                        width: `${Math.max(selection.rect.width, 18)}px`,
                        height: `${Math.max(selection.rect.height, 18)}px`,
                        borderColor:
                            selection.color === "orange"
                                ? "rgba(223,107,65,0.48)"
                                : selection.color === "green"
                                  ? "rgba(111,159,56,0.48)"
                                  : selection.color === "blue"
                                    ? "rgba(47,159,180,0.48)"
                                    : "rgba(201,152,18,0.48)",
                        background:
                            selection.color === "orange"
                                ? "rgba(255,116,72,0.26)"
                                : selection.color === "green"
                                  ? "rgba(138,198,80,0.26)"
                                  : selection.color === "blue"
                                    ? "rgba(55,197,221,0.24)"
                                    : "rgba(247,201,72,0.34)",
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectionMenuOpen(true);
                    }}
                    aria-label="Open temporary highlight tools"
                />
            ) : null}

            {visibleNoteMarkers.length && !isMobileLayout ? (
                <div className="pointer-events-none fixed inset-0 z-[18]">
                    {visibleNoteMarkers.map(({ annotation, rect }) => {
                        const markerSize = 28;
                        const prefersLeft = rect.left >= 48;
                        const left = prefersLeft
                            ? Math.max(8, rect.left - 36)
                            : Math.min(
                                  viewportWidth - markerSize - 8,
                                  rect.right + 8,
                              );
                        const top = Math.max(
                            8,
                            Math.min(
                                viewportHeight - markerSize - 8,
                                rect.top + rect.height / 2 - markerSize / 2,
                            ),
                        );

                        return (
                            <button
                                key={annotation.annotation_id}
                                type="button"
                                data-reader-chrome="true"
                                className="pointer-events-auto fixed inline-flex items-center justify-center rounded-[9px] border shadow-[0_8px_18px_rgba(15,23,42,0.14)]"
                                style={{
                                    left: `${left}px`,
                                    top: `${top}px`,
                                    width: `${markerSize}px`,
                                    height: `${markerSize}px`,
                                    borderColor:
                                        settings.theme === "dark"
                                            ? "rgba(255,255,255,0.12)"
                                            : "rgba(166,140,42,0.28)",
                                    background:
                                        settings.theme === "dark"
                                            ? "rgba(23,26,32,0.94)"
                                            : "rgba(255,255,255,0.96)",
                                    color:
                                        annotation.color === "orange"
                                            ? "#df6b41"
                                            : annotation.color === "green"
                                              ? "#6f9f38"
                                              : annotation.color === "blue"
                                                ? "#2f9fb4"
                                                : "#c99812",
                                }}
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openExistingNote(annotation, rect);
                                }}
                                aria-label={`Open note for ${annotation.title || "highlight"}`}
                            >
                                <IonIcon
                                    icon={documentTextOutline}
                                    className="text-[1rem]"
                                />
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <div
                data-reader-chrome="true"
                className={`absolute inset-x-0 bottom-0 z-20 px-3 pb-4 transition duration-200 sm:px-6 sm:pb-5 ${
                    showReaderChrome
                        ? "opacity-100"
                        : "pointer-events-none opacity-0"
                }`}
                style={{
                    paddingBottom: isMobileLayout
                        ? "calc(env(safe-area-inset-bottom) + 16px)"
                        : undefined,
                }}
            >
                <div
                    className="mx-auto mb-[-20px] flex max-w-[1080px] flex-col items-center gap-3 sm:gap-4"
                    style={{ color: chromePrimary }}
                >
                    <div
                        className="text-center mb-[-30px] text-[0.8rem] tracking-[-0.03em]"
                        style={{ color: chromeSecondary }}
                    >
                        {pagesLeftText}
                    </div>
                    <div className="flex w-full min-w-0 items-center gap-2 sm:gap-4">
                        {showDesktopContentsControl ? (
                            <IconButton
                                icon={menuOutline}
                                label="Contents"
                                onClick={() => openContents("chapters")}
                                compact={isMobileLayout}
                            />
                        ) : null}
                        <button
                            type="button"
                            data-reader-chrome="true"
                            aria-label="Previous page"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] text-[22px] md:hidden sm:h-10 sm:w-10 sm:text-[24px]"
                            style={{
                                color: chromePrimary,
                                background: uiPalette.pillBackground,
                                boxShadow: uiPalette.pillShadow,
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                turnPrevPage();
                            }}
                        >
                            <IonIcon icon={arrowBackOutline} />
                        </button>
                        <input
                            type="range"
                            min={1}
                            max={Math.max(surfaceState.totalPages, 1)}
                            value={sliderValue}
                            onChange={(event) => {
                                surfaceRef.current?.goToPage(
                                    Number(event.target.value),
                                );
                            }}
                            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[#bfc8ec] accent-[#5670b5]"
                            style={{
                                background: uiPalette.accentSoft,
                            }}
                        />
                        <button
                            type="button"
                            data-reader-chrome="true"
                            aria-label="Next page"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] text-[22px] md:hidden sm:h-10 sm:w-10 sm:text-[24px]"
                            style={{
                                color: chromePrimary,
                                background: uiPalette.pillBackground,
                                boxShadow: uiPalette.pillShadow,
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                turnNextPage();
                            }}
                        >
                            <IonIcon
                                icon={arrowBackOutline}
                                className="rotate-180"
                            />
                        </button>
                        <div
                            className="min-w-[46px] shrink-0 text-right text-[0.88rem] tracking-[-0.03em] sm:min-w-[88px] sm:text-[1.1rem]"
                            style={{ color: chromePrimary }}
                        >
                            {surfaceState.currentPage} /{" "}
                            {surfaceState.totalPages}
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
                    turnPrevPage();
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
                    turnNextPage();
                }}
            />
            <TakeoverScreen
                title={book.title}
                open={overlay === "contents"}
                onClose={() => setOverlay(null)}
                theme={settings.theme}
                compact={isMobileLayout}
            >
                <div className="mx-auto w-full max-w-[980px]">
                    <div
                        className="flex items-center justify-center gap-10 px-6 pt-4 sm:px-10"
                        style={{ borderBottom: `1px solid ${uiPalette.border}` }}
                    >
                        {(["chapters", "bookmarks", "notes"] as const).map(
                            (tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setContentsTab(tab)}
                                    className={`border-b-[4px] px-2 pb-4 text-[1.1rem] tracking-[-0.03em] ${
                                        contentsTab === tab
                                            ? "border-[#5670b5] text-[#5670b5]"
                                            : "border-transparent"
                                    }`}
                                    style={
                                        contentsTab === tab
                                            ? undefined
                                            : { color: uiPalette.textPrimary }
                                    }
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ),
                        )}
                    </div>

                    {contentsTab === "chapters" ? (
                        <div>
                            {tocItems.map((item: any, index) => (
                                <ReaderListRow
                                    key={`${item.href || item.label}-${index}`}
                                    icon={
                                        <span
                                            className={`mt-2 inline-block h-3.5 w-3.5 rounded-full ${
                                                index === 0
                                                    ? "bg-[#5670b5]"
                                                    : "bg-black/18"
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
                                    theme={settings.theme}
                                    onClick={() => handleContentsJump(item)}
                                />
                            ))}
                        </div>
                    ) : null}

                    {contentsTab === "bookmarks" ? (
                        <div>
                            {bookmarkAnnotations.length === 0 ? (
                                <div
                                    className="px-10 py-14 text-lg"
                                    style={{ color: uiPalette.textSecondary }}
                                >
                                    No bookmarks yet.
                                </div>
                            ) : (
                                bookmarkAnnotations.map((annotation) => (
                                    <ReaderListRow
                                        key={annotation.annotation_id}
                                        icon={
                                            <IonIcon icon={bookmarkOutline} />
                                        }
                                        title={
                                            annotation.title ||
                                            annotation.chapter_label ||
                                            annotation.page_label
                                        }
                                        subtitle={`at ${annotation.page_label || annotation.chapter_label || "current page"}`}
                                        body={
                                            annotation.quote_text ? (
                                                <span>
                                                    {annotation.quote_text}
                                                </span>
                                            ) : undefined
                                        }
                                        accent="#5f6368"
                                        theme={settings.theme}
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
                                <div
                                    className="px-10 py-14 text-lg"
                                    style={{ color: uiPalette.textSecondary }}
                                >
                                    No reader notes yet.
                                </div>
                            ) : (
                                noteAnnotations.map((annotation) => (
                                    <ReaderListRow
                                        key={annotation.annotation_id}
                                        icon={<IonIcon icon={createOutline} />}
                                        title={
                                            annotation.title ||
                                            annotation.chapter_label ||
                                            "Reader note"
                                        }
                                        subtitle={`at ${annotation.page_label || annotation.chapter_label || "current page"}`}
                                        body={
                                            <span className="bg-[#f5d97a] px-1">
                                                {annotation.quote_text ||
                                                    annotation.note ||
                                                    "Open note"}
                                            </span>
                                        }
                                        accent="#c99812"
                                        theme={settings.theme}
                                        onClick={() =>
                                            openExistingNote(annotation)
                                        }
                                    />
                                ))
                            )}
                        </div>
                    ) : null}
                </div>
            </TakeoverScreen>

            <TakeoverScreen
                title="Search in book"
                open={overlay === "search"}
                onClose={() => setOverlay(null)}
                theme={settings.theme}
                compact={isMobileLayout}
            >
                <div className="mx-auto flex h-full w-full max-w-[980px] flex-col">
                    <div className="px-6 py-4 sm:px-10">
                        <div
                            className="flex items-center gap-4 rounded-[16px] px-6 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                            style={{
                                background: uiPalette.surface,
                                border: `1px solid ${uiPalette.border}`,
                            }}
                        >
                            <IonIcon
                                icon={searchOutline}
                                className="text-2xl"
                                style={{ color: uiPalette.iconSecondary }}
                            />
                            <input
                                autoFocus
                                value={searchQuery}
                                onChange={(event) =>
                                    setSearchQuery(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        void runSearch();
                                    }
                                }}
                                placeholder="Search in book"
                                className="w-full bg-transparent text-[1.3rem] outline-none placeholder:text-[#9aa0a6]"
                                style={{ color: uiPalette.textPrimary }}
                            />
                        </div>
                    </div>

                    {!searchQuery.trim() && recentQueries.length ? (
                        <div className="px-6 pb-4 sm:px-10">
                            <div
                                className="overflow-hidden rounded-[16px] shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                                style={{
                                    background: uiPalette.surface,
                                    border: `1px solid ${uiPalette.border}`,
                                }}
                            >
                                {recentQueries.map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => void openSearch(item)}
                                        className="flex w-full items-center justify-between px-10 py-6 text-left text-[1.2rem] hover:bg-black/[0.02]"
                                        style={{ color: uiPalette.textPrimary }}
                                    >
                                        <span>{item}</span>
                                        <IonIcon
                                            icon={arrowBackOutline}
                                            className="rotate-[135deg] text-[1.8rem]"
                                            style={{ color: uiPalette.iconSecondary }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 sm:px-10">
                        {searchLoading ? (
                            <div
                                className="py-8 text-lg"
                                style={{ color: uiPalette.textSecondary }}
                            >
                                Searching…
                            </div>
                        ) : searchResults.length === 0 ? (
                            <div
                                className="py-8 text-lg"
                                style={{ color: uiPalette.textSecondary }}
                            >
                                No matches yet.
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {searchResults.map((result) => (
                                    <button
                                        key={result.result_id}
                                        type="button"
                                        onClick={() => handleResultJump(result)}
                                        className="w-full rounded-[16px] px-8 py-6 text-left shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                                        style={{
                                            background: uiPalette.surface,
                                            border: `1px solid ${uiPalette.border}`,
                                        }}
                                    >
                                        <div
                                            className="text-[1.15rem] font-semibold"
                                            style={{ color: uiPalette.textPrimary }}
                                        >
                                            {result.label ||
                                                result.page_label ||
                                                `Result ${result.result_id}`}
                                        </div>
                                        <div
                                            className="mt-2 text-[1rem]"
                                            style={{ color: uiPalette.textSecondary }}
                                        >
                                            {result.page
                                                ? `page ${result.page}`
                                                : result.page_label || ""}
                                        </div>
                                        <div
                                            className="mt-4 text-[1.2rem] leading-9"
                                            style={{ color: uiPalette.textPrimary }}
                                        >
                                            <mark className="bg-[#f3dd73] px-1">
                                                {result.snippet}
                                            </mark>
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
                placement={isMobileLayout ? "bottom" : "top-right"}
                theme={settings.theme}
                compact={isMobileLayout}
            >
                <div className="space-y-4">
                    <div
                        className="flex items-center justify-center gap-10 pb-2.5"
                        style={{ borderBottom: `1px solid ${uiPalette.border}` }}
                    >
                        <button
                            type="button"
                            onClick={() => setSettingsTab("text")}
                            className={`border-b-[4px] px-2 pb-2.5 text-[1.08rem] ${
                                settingsTab === "text"
                                    ? "border-[#5670b5] text-[#5670b5]"
                                    : "border-transparent"
                            }`}
                            style={
                                settingsTab === "text"
                                    ? undefined
                                    : { color: uiPalette.textSecondary }
                            }
                        >
                            Text
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettingsTab("lighting")}
                            className={`border-b-[4px] px-2 pb-2.5 text-[1.08rem] ${
                                settingsTab === "lighting"
                                    ? "border-[#5670b5] text-[#5670b5]"
                                    : "border-transparent"
                            }`}
                            style={
                                settingsTab === "lighting"
                                    ? undefined
                                    : { color: uiPalette.textSecondary }
                            }
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
                                            onClick={() =>
                                                updateSetting(
                                                    "fontFamily",
                                                    font.value,
                                                )
                                            }
                                            className="flex flex-col items-center gap-2"
                                            style={{ color: uiPalette.textPrimary }}
                                        >
                                            <span
                                                className={`flex h-[64px] w-[64px] items-center justify-center rounded-full border text-[2.55rem] ${
                                                    settings.fontFamily ===
                                                    font.value
                                                        ? "border-[#5670b5] bg-[#5670b5] text-white"
                                                        : ""
                                                }`}
                                                style={{
                                                    fontFamily: font.value,
                                                    ...(settings.fontFamily ===
                                                    font.value
                                                        ? {}
                                                        : sheetInputStyle),
                                                }}
                                            >
                                                A
                                            </span>
                                            <span className="text-[0.8rem]">
                                                {font.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSetting(
                                            "fontSize",
                                            clamp(
                                                settings.fontSize - 10,
                                                80,
                                                180,
                                            ),
                                        )
                                    }
                                    className="flex h-[58px] items-center justify-center rounded-[8px]"
                                    style={sheetInputStyle}
                                    aria-label="Smaller text"
                                >
                                    <span className="text-[1.9rem] font-semibold leading-none">
                                        T
                                    </span>
                                </button>
                                <div
                                    className="text-center text-[0.94rem]"
                                    style={sheetMutedTextStyle}
                                >
                                    {Math.round(
                                        (settings.fontSize / 100) * 100,
                                    )}
                                    %
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSetting(
                                            "fontSize",
                                            clamp(
                                                settings.fontSize + 10,
                                                80,
                                                180,
                                            ),
                                        )
                                    }
                                    className="flex h-[58px] items-center justify-center rounded-[8px]"
                                    style={sheetInputStyle}
                                    aria-label="Larger text"
                                >
                                    <span className="text-[2.35rem] font-semibold leading-none">
                                        T
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSetting(
                                            "lineHeight",
                                            clamp(
                                                settings.lineHeight - 0.1,
                                                1.3,
                                                2.2,
                                            ),
                                        )
                                    }
                                    className="flex h-[58px] items-center justify-center gap-1 rounded-[8px]"
                                    style={sheetInputStyle}
                                    aria-label="Tighter spacing"
                                >
                                    <IonIcon
                                        icon={swapVerticalOutline}
                                        className="text-[1.15rem]"
                                    />
                                    <IonIcon
                                        icon={reorderThreeOutline}
                                        className="text-[1.45rem]"
                                    />
                                </button>
                                <div
                                    className="text-center text-[0.94rem]"
                                    style={sheetMutedTextStyle}
                                >
                                    {Math.round(
                                        (settings.lineHeight / 1.6) * 100,
                                    )}
                                    %
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSetting(
                                            "lineHeight",
                                            clamp(
                                                settings.lineHeight + 0.1,
                                                1.3,
                                                2.2,
                                            ),
                                        )
                                    }
                                    className="flex h-[58px] items-center justify-center gap-1 rounded-[8px]"
                                    style={sheetInputStyle}
                                    aria-label="Looser spacing"
                                >
                                    <IonIcon
                                        icon={swapVerticalOutline}
                                        className="text-[1.15rem]"
                                    />
                                    <IonIcon
                                        icon={menuOutline}
                                        className="text-[1.45rem]"
                                    />
                                </button>
                            </div>

                            {ext === "pdf" && platformLayout === "desktop" ? (
                                <div className="space-y-2">
                                    <div
                                        className="text-[0.78rem] font-medium uppercase tracking-[0.18em]"
                                        style={sheetMutedTextStyle}
                                    >
                                        Page Layout
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateSetting("spread", "none")
                                            }
                                            className={`rounded-[8px] border px-3.5 py-2 text-[0.86rem] ${
                                                settings.spread !== "always"
                                                    ? "border-[#5670b5] bg-[#5670b5] text-white"
                                                    : ""
                                            }`}
                                            style={
                                                settings.spread !== "always"
                                                    ? undefined
                                                    : sheetInputStyle
                                            }
                                        >
                                            Single page
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateSetting(
                                                    "spread",
                                                    "always",
                                                )
                                            }
                                            className={`rounded-[8px] border px-3.5 py-2 text-[0.86rem] ${
                                                settings.spread === "always"
                                                    ? "border-[#5670b5] bg-[#5670b5] text-white"
                                                    : ""
                                            }`}
                                            style={
                                                settings.spread === "always"
                                                    ? undefined
                                                    : sheetInputStyle
                                            }
                                        >
                                            Two-page
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div
                                className="flex items-center gap-3 rounded-[8px] px-3.5 py-3"
                                style={sheetInputStyle}
                            >
                                <IonIcon
                                    icon={menuSharp}
                                    className="text-[1.35rem]"
                                    style={{ color: uiPalette.iconSecondary }}
                                />
                                <div
                                    className="flex-1 text-[0.9rem]"
                                    style={{ color: uiPalette.textPrimary }}
                                >
                                    {settings.alignment === "left"
                                        ? "Left"
                                        : settings.alignment === "justify"
                                          ? "Justify"
                                          : "Default"}
                                </div>
                                <select
                                    value={settings.alignment || "default"}
                                    onChange={(event) =>
                                        updateSetting(
                                            "alignment",
                                            event.target.value as
                                                | "default"
                                                | "left"
                                                | "justify",
                                        )
                                    }
                                    className="bg-transparent text-[0.9rem] outline-none"
                                    style={{ color: uiPalette.textPrimary }}
                                >
                                    <option value="default">Default</option>
                                    <option value="left">Left</option>
                                    <option value="justify">Justify</option>
                                </select>
                                <IonIcon
                                    icon={chevronDownOutline}
                                    className="text-xl"
                                    style={{ color: uiPalette.iconSecondary }}
                                />
                            </div>
                        </>
                    ) : null}

                    {settingsTab === "lighting" ? (
                        <div className="space-y-4">
                            <div
                                className="text-[0.96rem]"
                                style={{ color: uiPalette.textPrimary }}
                            >
                                Reading brightness
                            </div>
                            <input
                                type="range"
                                min={55}
                                max={130}
                                value={settings.brightness || 100}
                                onChange={(event) =>
                                    updateSetting(
                                        "brightness",
                                        Number(event.target.value),
                                    )
                                }
                                className="w-full accent-[#5670b5]"
                            />
                            <div
                                className="text-[0.96rem]"
                                style={{ color: uiPalette.textPrimary }}
                            >
                                Viewing theme
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {PLAY_BOOKS_THEMES.map((theme) => (
                                    <button
                                        key={theme.value}
                                        type="button"
                                        onClick={() =>
                                            updateSetting("theme", theme.value)
                                        }
                                        className={`h-12 rounded-[6px] border ${
                                            settings.theme === theme.value
                                                ? ""
                                                : ""
                                        }`}
                                        style={{
                                            backgroundColor: theme.paper,
                                            borderColor:
                                                settings.theme === theme.value
                                                    ? uiPalette.textPrimary
                                                    : uiPalette.border,
                                        }}
                                        aria-label={theme.label}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center justify-between">
                                <div
                                    className="text-[0.96rem]"
                                    style={{ color: uiPalette.textPrimary }}
                                >
                                    Reading Night Light
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSetting(
                                            "nightLight",
                                            !settings.nightLight,
                                        )
                                    }
                                    className={`relative h-9 w-16 rounded-full transition ${
                                        settings.nightLight
                                            ? "bg-[#5670b5]"
                                            : ""
                                    }`}
                                    style={
                                        settings.nightLight
                                            ? undefined
                                            : { background: uiPalette.borderStrong }
                                    }
                                >
                                    <span
                                        className={`absolute top-1 h-7 w-7 rounded-full bg-white transition ${
                                            settings.nightLight
                                                ? "left-[32px]"
                                                : "left-[4px]"
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
                compact={isMobileLayout}
            >
                <div className="space-y-6">
                    <div
                        className="grid grid-cols-2 gap-[1px] overflow-hidden"
                        style={{
                            background: uiPalette.borderStrong,
                            border: `1px solid ${uiPalette.borderStrong}`,
                        }}
                    >
                        <select
                            value={translateSourceLanguage}
                            onChange={(event) => {
                                const value = event.target.value;
                                setTranslateSourceLanguage(value);
                                void runTranslate(
                                    translateInputText,
                                    value,
                                    translateTargetLanguage,
                                    translateMode,
                                );
                            }}
                            className="px-4 py-3 text-[0.96rem] outline-none"
                            style={{
                                background: uiPalette.surfaceMuted,
                                color: uiPalette.textPrimary,
                            }}
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
                                void runTranslate(
                                    translateInputText,
                                    translateSourceLanguage,
                                    value,
                                    translateMode,
                                );
                            }}
                            className="px-4 py-3 text-[0.96rem] outline-none"
                            style={{
                                background: uiPalette.surfaceMuted,
                                color: uiPalette.textPrimary,
                            }}
                        >
                            {LANGUAGE_OPTIONS.filter(
                                (option) => option.value !== "auto",
                            ).map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div
                        className="min-h-[180px] px-4 py-4 text-[0.96rem] leading-7"
                        style={sheetInputStyle}
                    >
                        {translateLoading
                            ? "Translating…"
                            : translateState?.translated_text ||
                              "No translation yet."}
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
                compact={isMobileLayout}
            >
                <div className="space-y-5" style={{ color: uiPalette.textPrimary }}>
                    {defineLoading ? (
                        <div className="text-lg" style={sheetMutedTextStyle}>
                            Looking up definition…
                        </div>
                    ) : defineResult ? (
                        <>
                            {defineResult.phonetic ? (
                                <div className="text-[1rem]" style={sheetMutedTextStyle}>
                                    {defineResult.phonetic}
                                </div>
                            ) : null}
                            {defineResult.summary ? (
                                <div className="text-[1.15rem] leading-8">
                                    {defineResult.summary}
                                </div>
                            ) : null}
                            <div className="space-y-4 text-[0.98rem] leading-7">
                                {(defineResult.definitions || []).map(
                                    (item, index) => (
                                        <div
                                            key={`${item.definition}-${index}`}
                                        >
                                            {item.part_of_speech ? (
                                                <div className="font-medium">
                                                    {item.part_of_speech}
                                                </div>
                                            ) : null}
                                            <div>{item.definition}</div>
                                            {item.example ? (
                                                <div className="mt-1" style={sheetMutedTextStyle}>
                                                    {item.example}
                                                </div>
                                            ) : null}
                                        </div>
                                    ),
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-lg" style={sheetMutedTextStyle}>
                            No definition available.
                        </div>
                    )}
                </div>
            </ReaderSheet>

            {overlay === "note" ? (
                <div
                    data-reader-overlay="true"
                    className={`absolute inset-0 z-[80] flex items-end justify-center ${
                        isMobileLayout ? "px-0" : "px-3 pt-20 sm:px-6 sm:pb-8"
                    }`}
                    style={{
                        background: uiPalette.overlayBackdrop,
                        paddingTop: isMobileLayout
                            ? "max(12px, calc(env(safe-area-inset-top) + 12px))"
                            : undefined,
                        paddingBottom: isMobileLayout
                            ? "env(safe-area-inset-bottom)"
                            : undefined,
                    }}
                    onClick={(event) => {
                        if (event.target !== event.currentTarget) return;
                        closeNoteOverlay();
                    }}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                >
                    <div
                        className={`w-full max-w-[388px] overflow-hidden shadow-[0_10px_18px_rgba(15,23,42,0.10)] ${
                            isMobileLayout ? "rounded-t-[20px]" : "rounded-[10px]"
                        }`}
                        style={{
                            border: `1px solid ${uiPalette.borderStrong}`,
                            background: uiPalette.surfaceMuted,
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                    >
                        {isMobileLayout ? (
                            <div
                                className="mx-auto mt-3 h-1.5 w-12 rounded-full"
                                style={{ background: uiPalette.borderStrong }}
                            />
                        ) : null}
                        <div
                            className="px-4 pt-5"
                            style={{
                                paddingTop: isMobileLayout
                                    ? "12px"
                                    : undefined,
                            }}
                        >
                            <textarea
                                value={noteDraft}
                                onChange={(event) =>
                                    setNoteDraft(event.target.value)
                                }
                                placeholder="Add note"
                                className="min-h-[250px] w-full resize-none bg-transparent px-0 py-0 text-[1rem] leading-7 outline-none placeholder:text-[#9aa0a6]"
                                style={{ color: uiPalette.textPrimary }}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
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
                                                          text:
                                                              activeNote?.quote_text ||
                                                              "",
                                                          color: chip.key,
                                                          kind: "temp-highlight",
                                                          phase: "final",
                                                          source: "mouse",
                                                      },
                                            )
                                        }
                                        className={`h-10 w-10 rounded-full border-4 ${
                                            (selection?.color ||
                                                activeNote?.color ||
                                                "amber") === chip.key
                                                ? "border-white ring-2 ring-current"
                                                : "border-transparent"
                                        }`}
                                        style={{
                                            backgroundColor: chip.swatch,
                                            color: chip.swatch,
                                        }}
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
                                            closeNoteOverlay();
                                        }
                                    }}
                                    className="rounded-full px-6 py-2.5 text-[0.96rem]"
                                    style={{
                                        border: `1px solid ${uiPalette.borderStrong}`,
                                        background: uiPalette.surface,
                                        color: uiPalette.accent,
                                    }}
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
                compact={isMobileLayout}
            >
                <div className="space-y-5">
                    <div
                        className="rounded-[12px] px-5 py-4 text-[0.96rem] leading-7"
                        style={{
                            background: uiPalette.surface,
                            border: `1px solid ${uiPalette.border}`,
                            color: uiPalette.textSecondary,
                        }}
                    >
                        {selection?.text}
                    </div>
                    <textarea
                        value={ragPrompt}
                        onChange={(event) => setRagPrompt(event.target.value)}
                        placeholder="What should I analyze from this passage?"
                        className="min-h-[112px] w-full resize-none rounded-[12px] px-4 py-4 text-[0.96rem] leading-7 outline-none"
                        style={sheetInputStyle}
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
                open={
                    !!selection &&
                    selection.phase === "final" &&
                    overlay === null &&
                    (!isMobileLayout || selectionMenuOpen)
                }
                color={selection?.color || "amber"}
                anchorRect={selection?.rect || null}
                theme={settings.theme}
                mobile={isMobileLayout}
                isTemporaryHighlight={
                    Boolean(
                        selection &&
                            selection.kind === "temp-highlight" &&
                            !selection.annotationId,
                    )
                }
                onColor={(color) => void handleSelectionColor(color)}
                onSaveHighlight={() => void saveTemporaryHighlight()}
                onClearHighlight={clearTemporaryHighlight}
                onAddNote={openNewNote}
                onDefine={() => void openDefine()}
                onTranslate={() => void openTranslate("selection")}
                onCopy={() => void copySelection()}
                onSearch={() => void openSearch(selection?.text || "")}
                onFindEchoes={handleFindEchoes}
                onAskRag={handleAskRag}
                onDeleteHighlight={() => void deleteSelectedHighlight()}
                onDismiss={() => {
                    if (
                        isMobileLayout &&
                        selection?.kind === "temp-highlight" &&
                        !selection.annotationId
                    ) {
                        setSelectionMenuOpen(false);
                        return;
                    }
                    closeSelection();
                }}
                hasSavedHighlight={Boolean(selection?.annotationId)}
            />
        </div>
    );
}
