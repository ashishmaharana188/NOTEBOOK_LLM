import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import type {
  ReaderAnnotation,
  ReaderBook,
  ReaderLocationPayload,
  ReaderManifestSection,
} from "../../types/readerBackendTypes";
import { useReaderSetting } from "../../hooks/reader/useReaderSetting";
import {
  IconLineHeight,
  IconList,
  IconPanelClose,
  IconSettings,
} from "./readerIcons";
import ReaderAnnotationPanel from "./ReaderAnnotationPanel";
import ReaderPanelSection from "./ReaderPanelSection";

const FONT_OPTIONS = [
  { label: "Georgia", value: "Georgia, serif" },
  {
    label: "Palatino",
    value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  },
  { label: "Helvetica", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Inter", value: "Inter, 'Helvetica Neue', Arial, sans-serif" },
  { label: "Merriweather", value: "'Merriweather', Georgia, serif" },
  { label: "Monospace", value: "'SFMono-Regular', Consolas, monospace" },
];

const THEME_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Sepia", value: "sepia" },
  { label: "Dark", value: "dark" },
] as const;

interface SectionOption {
  index: number;
  label: string;
}

interface TocItemLike {
  label?: string;
  char_index?: number;
}

interface TextReaderProps {
  book: ReaderBook | null;
  content: string;
  initialLocation: string | number | null;
  onSaveLocation: (payload: ReaderLocationPayload) => void;
  onSelection?: (text: string) => void;
  currentSectionIndex: number;
  sectionCount: number;
  sectionLabel: string;
  sections?: ReaderManifestSection[];
  toc?: TocItemLike[];
  initialPageIndex?: number;
  onNavigateSection: (sectionIndex: number) => void;
  isLoadingSection?: boolean;
  chromeVisible: boolean;
  annotations: ReaderAnnotation[];
  onAddBookmark: () => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<
      Pick<
        ReaderAnnotation,
        | "title"
        | "note"
        | "color"
        | "kind"
        | "page_label"
        | "chapter_label"
        | "anchor"
        | "quote_text"
      >
    >,
  ) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onJumpToAnnotation: (annotation: ReaderAnnotation) => void;
}

function normalizeSectionLabel(rawLabel: string | undefined, index: number) {
  const raw = String(rawLabel || "").trim();
  if (!raw) return `Section ${index + 1}`;

  const cleaned = raw
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || `Section ${index + 1}`;
}

function resolveSectionIndexForChar(
  sections: ReaderManifestSection[],
  charIndex: number,
) {
  if (!sections.length) return -1;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) continue;
    const start = Number(section.start_offset ?? 0);
    const end = Number(section.end_offset ?? start);
    if (charIndex >= start && charIndex < end) {
      return index;
    }
  }

  let fallbackIndex = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) continue;
    const start = Number(section.start_offset ?? 0);
    if (charIndex >= start) {
      fallbackIndex = index;
    } else {
      break;
    }
  }
  return fallbackIndex;
}

function buildSectionOptions(
  sections: ReaderManifestSection[],
  toc: TocItemLike[],
): SectionOption[] {
  const labelsBySection = new Map<number, string>();

  toc.forEach((item) => {
    const label = String(item.label || "").trim();
    const charIndex = Number(item.char_index);
    if (!label || Number.isNaN(charIndex)) return;
    const targetIndex = resolveSectionIndexForChar(sections, charIndex);
    if (targetIndex >= 0 && !labelsBySection.has(targetIndex)) {
      labelsBySection.set(targetIndex, label);
    }
  });

  return sections.map((section, index) => ({
    index,
    label: labelsBySection.get(index) || normalizeSectionLabel(section.label, index),
  }));
}

export default function TextReader({
  book,
  content,
  initialLocation,
  onSaveLocation,
  onSelection,
  currentSectionIndex,
  sectionCount,
  sectionLabel,
  sections = [],
  toc = [],
  initialPageIndex = 0,
  onNavigateSection,
  isLoadingSection = false,
  chromeVisible,
  annotations,
  onAddBookmark,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onJumpToAnnotation,
}: TextReaderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const paginatedViewportRef = useRef<HTMLDivElement>(null);
  const { settings, updateSetting, themeStyles } = useReaderSetting();
  const [showPanel, setShowPanel] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const deferredContent = useDeferredValue(content);

  const safeSections = useMemo(
    () =>
      sections.length
        ? sections
        : Array.from({ length: Math.max(sectionCount, 0) }, (_, index) => ({
            section_index: index,
            label: index === currentSectionIndex ? sectionLabel : `Section ${index + 1}`,
          })),
    [currentSectionIndex, sectionCount, sectionLabel, sections],
  );
  const sectionOptions = useMemo(
    () => buildSectionOptions(safeSections, toc),
    [safeSections, toc],
  );
  const activeSectionTitle = useMemo(() => {
    return (
      sectionOptions.find((option) => option.index === currentSectionIndex)?.label ||
      normalizeSectionLabel(sectionLabel, currentSectionIndex)
    );
  }, [currentSectionIndex, sectionLabel, sectionOptions]);

  const isPaginated = settings.flow === "paginated";
  const spreadRequested = settings.spread === "always";
  const spreadActive = spreadRequested && viewportSize.width >= 960;
  const columnsPerPage = isPaginated ? (spreadActive ? 2 : 1) : 1;
  const fontSizePx = Math.max(16, (settings.fontSize / 100) * 18);
  const lineHeightPx = Math.max(fontSizePx * settings.lineHeight, fontSizePx + 6);
  const fontDeclaration = `${fontSizePx}px ${settings.fontFamily}`;

  useEffect(() => {
    const node = paginatedViewportRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setViewportSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPaginated && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentSectionIndex, initialLocation, isPaginated]);

  useEffect(() => {
    setActivePageIndex(Math.max(0, Number(initialPageIndex || 0)));
  }, [currentSectionIndex, deferredContent, initialPageIndex]);

  const paginatedPages = useMemo(() => {
    if (!isPaginated || !deferredContent?.trim()) return [] as string[][][];
    if (!viewportSize.width || !viewportSize.height) return [] as string[][][];

    const outerPaddingX = viewportSize.width < 768 ? 24 : 48;
    const outerPaddingY = viewportSize.height < 700 ? 28 : 42;
    const columnGap = columnsPerPage === 2 ? 40 : 0;
    const availableWidth = Math.max(
      220,
      viewportSize.width - outerPaddingX * 2 - columnGap * (columnsPerPage - 1),
    );
    const columnWidth = Math.max(180, Math.floor(availableWidth / columnsPerPage));
    const availableHeight = Math.max(120, viewportSize.height - outerPaddingY * 2);
    const linesPerColumn = Math.max(1, Math.floor(availableHeight / lineHeightPx));

    const prepared = prepareWithSegments(deferredContent, fontDeclaration, {
      whiteSpace: "pre-wrap",
    });
    const layout = layoutWithLines(prepared, columnWidth, lineHeightPx);
    const pageCapacity = Math.max(1, linesPerColumn * columnsPerPage);
    const pages: string[][][] = [];

    for (let start = 0; start < layout.lines.length; start += pageCapacity) {
      const pageLines = layout.lines.slice(start, start + pageCapacity);
      const columns: string[][] = [];
      for (let columnIndex = 0; columnIndex < columnsPerPage; columnIndex += 1) {
        const columnStart = columnIndex * linesPerColumn;
        const columnLines = pageLines
          .slice(columnStart, columnStart + linesPerColumn)
          .map((line) => line.text);
        if (columnLines.length) {
          columns.push(columnLines);
        }
      }
      if (columns.length) {
        pages.push(columns);
      }
    }

    return pages;
  }, [
    columnsPerPage,
    deferredContent,
    fontDeclaration,
    isPaginated,
    lineHeightPx,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!paginatedPages.length) {
      if (activePageIndex !== 0) {
        setActivePageIndex(0);
      }
      return;
    }
    if (activePageIndex > paginatedPages.length - 1) {
      setActivePageIndex(paginatedPages.length - 1);
    }
  }, [activePageIndex, paginatedPages]);

  useEffect(() => {
    onSaveLocation({
      location: currentSectionIndex,
      locationType: "text_section",
      progressPercent:
        sectionCount > 0 ? ((currentSectionIndex + 1) / sectionCount) * 100 : 0,
      pageLabel: activeSectionTitle,
      viewState: {
        pageIndex: isPaginated ? activePageIndex : 0,
        flow: settings.flow,
        spread: settings.spread,
      },
    });
  }, [
    activePageIndex,
    activeSectionTitle,
    currentSectionIndex,
    isPaginated,
    onSaveLocation,
    sectionCount,
    settings.flow,
    settings.spread,
  ]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && onSelection) {
      const text = selection.toString().trim();
      if (text.length > 0) {
        onSelection(text);
      }
    }
  };

  const handlePrev = () => {
    if (isPaginated && activePageIndex > 0) {
      setActivePageIndex((prev) => prev - 1);
      return;
    }
    onNavigateSection(currentSectionIndex - 1);
  };

  const handleNext = () => {
    if (isPaginated && activePageIndex < paginatedPages.length - 1) {
      setActivePageIndex((prev) => prev + 1);
      return;
    }
    onNavigateSection(currentSectionIndex + 1);
  };

  const currentPageColumns = paginatedPages[activePageIndex] || [];
  const layoutMode =
    settings.flow === "scrolled"
      ? "scroll"
      : settings.spread === "always"
      ? "spread"
      : "single";

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onPointerUp={handleMouseUp}
      style={{
        backgroundColor: themeStyles[settings.theme].body.background,
      }}
    >
      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className={`absolute right-3 top-3 z-50 bg-white px-3 py-2 text-primary shadow-lg transition-all sm:right-4 sm:top-4 ${
          showPanel || chromeVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        } ${showPanel ? "text-black" : "hover:bg-neutral-50"}`}
        title="Reader controls"
      >
        <IconSettings />
      </button>

      {showPanel ? (
        <aside className="absolute inset-x-3 top-16 bottom-3 z-40 flex flex-col overflow-hidden bg-surface px-5 py-4 shadow-2xl sm:inset-x-auto sm:right-20 sm:top-4 sm:bottom-4 sm:w-[360px]">
          <div className="flex items-start justify-between gap-4 pb-4">
            <div>
              <div className="text-sm font-semibold text-primary">
                Reader Controls
              </div>
              <div className="text-xs text-muted">{book?.title || "Untitled"}</div>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="text-xs font-medium uppercase tracking-[0.2em] text-primary"
              title="Close controls"
            >
              <span className="inline-flex items-center gap-1">
                <IconPanelClose />
                Close
              </span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <ReaderPanelSection title="Bookmarks" defaultOpen>
              <ReaderAnnotationPanel
                embedded
                annotations={annotations}
                onJump={onJumpToAnnotation}
                onAddBookmark={onAddBookmark}
                onUpdate={onUpdateAnnotation}
                onDelete={onDeleteAnnotation}
              />
            </ReaderPanelSection>

            <ReaderPanelSection title="Contents" icon={<IconList />} defaultOpen>
              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                Chapter
                <select
                  value={String(currentSectionIndex)}
                  onChange={(event) => {
                    setActivePageIndex(0);
                    onNavigateSection(Number(event.target.value));
                  }}
                  className="mt-2 w-full border-b border-black/10 bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  {sectionOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.18em] text-muted">
                <span className="truncate">{activeSectionTitle}</span>
                <span className="shrink-0">
                  {isPaginated
                    ? `Page ${activePageIndex + 1} / ${Math.max(
                        paginatedPages.length,
                        1,
                      )}`
                    : `Section ${currentSectionIndex + 1} / ${Math.max(sectionCount, 1)}`}
                </span>
              </div>

              <div className="flex items-center gap-5 pt-1 text-xs font-medium uppercase tracking-[0.18em]">
                <button
                  onClick={handlePrev}
                  disabled={currentSectionIndex <= 0 && (!isPaginated || activePageIndex <= 0)}
                  className="text-primary disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={handleNext}
                  disabled={
                    currentSectionIndex >= sectionCount - 1 &&
                    (!isPaginated || activePageIndex >= paginatedPages.length - 1)
                  }
                  className="text-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                Layout
                <select
                  value={layoutMode}
                  onChange={(event) => {
                    const nextMode = event.target.value;
                    setActivePageIndex(0);
                    if (nextMode === "scroll") {
                      updateSetting("flow", "scrolled");
                      updateSetting("spread", "none");
                    } else if (nextMode === "spread") {
                      updateSetting("flow", "paginated");
                      updateSetting("spread", "always");
                    } else {
                      updateSetting("flow", "paginated");
                      updateSetting("spread", "none");
                    }
                  }}
                  className="mt-2 w-full border-b border-black/10 bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  <option value="scroll">Scroll</option>
                  <option value="single">Single</option>
                  <option value="spread">Split</option>
                </select>
              </label>
              {spreadRequested && !spreadActive ? (
                <div className="text-xs text-muted">
                  Split mode collapses to a single page until the reader is wide enough.
                </div>
              ) : null}

              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                Font
                <select
                  value={settings.fontFamily}
                  onChange={(event) =>
                    updateSetting("fontFamily", event.target.value)
                  }
                  className="mt-2 w-full border-b border-black/10 bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
                  <span>A</span>
                  <span>{settings.fontSize}%</span>
                  <span className="text-base">A</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={180}
                  step={5}
                  value={settings.fontSize}
                  onChange={(event) =>
                    updateSetting("fontSize", Number(event.target.value))
                  }
                  className="w-full accent-black"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
                  <span>Tight</span>
                  <span>{settings.lineHeight.toFixed(1)}</span>
                  <span>Loose</span>
                </div>
                <input
                  type="range"
                  min={1.2}
                  max={2.2}
                  step={0.1}
                  value={settings.lineHeight}
                  onChange={(event) =>
                    updateSetting("lineHeight", Number(event.target.value))
                  }
                  className="w-full accent-black"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
                  <span>Narrow</span>
                  <span>{settings.pageMargin}%</span>
                  <span>Wide</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={18}
                  step={1}
                  value={settings.pageMargin}
                  onChange={(event) =>
                    updateSetting("pageMargin", Number(event.target.value))
                  }
                  className="w-full accent-black"
                />
              </div>

              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                Theme
                <select
                  value={settings.theme}
                  onChange={(event) =>
                    updateSetting(
                      "theme",
                      event.target.value as "light" | "sepia" | "dark",
                    )
                  }
                  className="mt-2 w-full border-b border-black/10 bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </ReaderPanelSection>
          </div>
        </aside>
      ) : null}

      {(isPaginated || sectionCount > 1) && (
        <>
          <button
            onClick={handlePrev}
            disabled={currentSectionIndex <= 0 && (!isPaginated || activePageIndex <= 0)}
            className="absolute left-0 top-0 bottom-0 z-30 w-[10%] cursor-w-resize bg-transparent disabled:pointer-events-none"
            title="Previous page"
          />
          <button
            onClick={handleNext}
            disabled={
              currentSectionIndex >= sectionCount - 1 &&
              (!isPaginated || activePageIndex >= paginatedPages.length - 1)
            }
            className="absolute right-0 top-0 bottom-0 z-30 w-[10%] cursor-e-resize bg-transparent disabled:pointer-events-none"
            title="Next page"
          />
        </>
      )}

      <div
        ref={paginatedViewportRef}
        className="h-full w-full overflow-hidden"
      >
        {isLoadingSection ? (
          <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8 sm:py-16 md:py-20">
            <div className="border border-dashed border-black/10 bg-canvas p-6 text-sm text-muted sm:p-8">
              Loading section...
            </div>
          </div>
        ) : isPaginated ? (
          <div className="flex h-full w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
            <div
              className="flex h-full w-full max-w-[1400px] gap-10 overflow-hidden border border-black/10 shadow-sm"
              style={{
                backgroundColor: themeStyles[settings.theme].body.background,
                color: themeStyles[settings.theme].body.color,
                padding: viewportSize.width < 768 ? "28px 24px" : "42px 48px",
              }}
            >
              {(currentPageColumns.length ? currentPageColumns : [[]]).map(
                (column, columnIndex) => (
                  <div
                    key={`page-column-${columnIndex}`}
                    className="min-w-0 flex-1 overflow-hidden"
                  >
                    {column.length ? (
                      column.map((line, lineIndex) => (
                        <div
                          key={`line-${columnIndex}-${lineIndex}`}
                          style={{
                            minHeight: `${lineHeightPx}px`,
                            lineHeight: `${lineHeightPx}px`,
                            fontFamily: settings.fontFamily,
                            fontSize: `${fontSizePx}px`,
                            whiteSpace: "pre-wrap",
                            textAlign: "justify",
                          }}
                        >
                          {line || "\u00A0"}
                        </div>
                      ))
                    ) : (
                      <div
                        style={{
                          minHeight: `${lineHeightPx}px`,
                          lineHeight: `${lineHeightPx}px`,
                          fontFamily: settings.fontFamily,
                          fontSize: `${fontSizePx}px`,
                        }}
                      >
                        No content available.
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="h-full overflow-y-auto"
          >
            <div
              className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8 sm:py-16 md:py-20"
              style={{
                paddingLeft: `${settings.pageMargin}%`,
                paddingRight: `${settings.pageMargin}%`,
              }}
            >
              <div
                className="whitespace-pre-wrap"
                style={{
                  color: themeStyles[settings.theme].body.color,
                  fontFamily: settings.fontFamily,
                  lineHeight: settings.lineHeight,
                  fontSize: `${fontSizePx}px`,
                  textAlign: "justify",
                  maxWidth: "100%",
                }}
              >
                {content || "No content available."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
