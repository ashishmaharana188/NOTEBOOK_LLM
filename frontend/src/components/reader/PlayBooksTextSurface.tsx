import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import type {
  ReaderLocationPayload,
  ReaderManifestSection,
  ReaderSearchResult,
} from "../../types/readerBackendTypes";
import {
  clamp,
  normalizeAlignment,
  type ReaderSurfaceCommonProps,
  type ReaderSurfaceHandle,
} from "./playBooksReaderShared";

interface PlayBooksTextSurfaceProps extends ReaderSurfaceCommonProps {
  content: string;
  initialLocation: string | number | null;
  currentSectionIndex: number;
  sectionCount: number;
  sectionLabel: string;
  sections: ReaderManifestSection[];
  initialPageIndex?: number;
  isLoading?: boolean;
  onNavigateSection: (sectionIndex: number) => void;
}

interface PageMeta {
  lines: string[];
  charStart: number;
  charEnd: number;
}

interface ParagraphMeta {
  text: string;
  charStart: number;
  charEnd: number;
}

const SEGMENTATION_FONT_FAMILY =
  "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
const SEGMENTATION_FONT_SIZE_PX = 30;
const SEGMENTATION_LINE_HEIGHT_PX = 48;

function renderHighlightedLine(line: string, query: string) {
  if (!query) return line;
  const matcher = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "ig",
  );
  const parts = line.split(matcher);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={`${part}-${index}`} className="bg-[#f3dd73] px-[0.03em] text-current">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
}

function buildPages(
  content: string,
  fontFamily: string,
  fontSizePx: number,
  lineHeightPx: number,
  pageWidth: number,
  pageHeight: number,
): PageMeta[] {
  if (!content.trim()) return [];
  const prepared = prepareWithSegments(content, `${fontSizePx}px ${fontFamily}`, {
    whiteSpace: "pre-wrap",
  });
  const layout = layoutWithLines(prepared, pageWidth, lineHeightPx);
  const linesPerPage = Math.max(1, Math.floor(pageHeight / lineHeightPx));
  const pages: PageMeta[] = [];
  let charCursor = 0;

  for (let start = 0; start < layout.lines.length; start += linesPerPage) {
    const pageLines = layout.lines.slice(start, start + linesPerPage).map((line) => line.text);
    const pageText = pageLines.join("\n");
    pages.push({
      lines: pageLines,
      charStart: charCursor,
      charEnd: charCursor + pageText.length,
    });
    charCursor += pageText.length + 1;
  }

  return pages;
}

function getSectionStartOffset(section: ReaderManifestSection | undefined) {
  return Number(section?.start_offset ?? 0);
}

function buildParagraphs(content: string): ParagraphMeta[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const paragraphs: ParagraphMeta[] = [];
  let currentLines: string[] = [];
  let currentStart = 0;
  let currentEnd = 0;
  let cursor = 0;

  const flush = () => {
    if (!currentLines.length) return;
    paragraphs.push({
      text: currentLines.join("\n"),
      charStart: currentStart,
      charEnd: currentEnd,
    });
    currentLines = [];
  };

  for (const line of lines) {
    const nextCursor = cursor + line.length + 1;
    if (line.trim().length === 0) {
      flush();
      cursor = nextCursor;
      continue;
    }
    if (!currentLines.length) {
      currentStart = cursor;
    }
    currentLines.push(line);
    currentEnd = cursor + line.length;
    cursor = nextCursor;
  }

  flush();
  return paragraphs;
}

export default forwardRef<ReaderSurfaceHandle, PlayBooksTextSurfaceProps>(
  function PlayBooksTextSurface(
    {
      content,
      initialLocation,
      currentSectionIndex,
      sectionCount,
      sectionLabel,
      sections,
      initialPageIndex = 0,
      isLoading = false,
      onNavigateSection,
      onSaveLocation,
      onStateChange,
      onSelection,
      searchQuery = "",
      onOpenContents,
      presentationMode,
      platformLayout,
      settings,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const paragraphRefs = useRef<Array<HTMLDivElement | null>>([]);
    const pendingCharIndexRef = useRef<number | null>(null);
    const suppressScrollSyncRef = useRef(false);
    const scrollReleaseTimeoutRef = useRef<number | null>(null);
    const [activePageIndex, setActivePageIndex] = useState(() =>
      Math.max(0, Number(initialPageIndex || 0)),
    );
    const [viewport, setViewport] = useState({ width: 0, height: 0 });

    const scrollMode = presentationMode === "scroll";
    const desktopLayout = platformLayout === "desktop";
    const fontSizePx = Math.max(24, Math.round((settings.fontSize / 100) * 30));
    const lineHeightPx = Math.max(fontSizePx * settings.lineHeight, fontSizePx + 16);
    const mobilePaged = !desktopLayout;
    const usePeekLayout = mobilePaged && viewport.width >= 1100;
    const mobilePagedWidth = Math.max(
      420,
      Math.min(980, Math.round(viewport.width * (usePeekLayout ? 0.68 : 0.86))),
    );
    const contentColumnWidth = desktopLayout
      ? Math.max(
          620,
          Math.min(
            scrollMode ? 760 : 780,
            viewport.width - (scrollMode ? 420 : 360),
          ),
        )
      : Math.max(460, Math.min(900, viewport.width - 88));
    const planeWidth = desktopLayout ? viewport.width : mobilePagedWidth;
    const innerWidth = Math.max(320, desktopLayout ? contentColumnWidth : planeWidth - 88);
    const innerHeight = Math.max(420, viewport.height - (scrollMode ? 84 : desktopLayout ? 96 : 160));

    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const update = () => {
        const rect = node.getBoundingClientRect();
        setViewport({
          width: Math.max(320, Math.floor(rect.width)),
          height: Math.max(420, Math.floor(rect.height)),
        });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      return () => {
        if (scrollReleaseTimeoutRef.current) {
          window.clearTimeout(scrollReleaseTimeoutRef.current);
        }
      };
    }, []);

    const pages = useMemo(
      () =>
        buildPages(
          content,
          SEGMENTATION_FONT_FAMILY,
          SEGMENTATION_FONT_SIZE_PX,
          SEGMENTATION_LINE_HEIGHT_PX,
          innerWidth,
          innerHeight,
        ),
      [content, innerHeight, innerWidth],
    );
    const paragraphs = useMemo(() => buildParagraphs(content), [content]);

    const safePageIndex = clamp(activePageIndex, 0, Math.max(pages.length - 1, 0));
    const currentPage: PageMeta | null = pages[safePageIndex] || null;
    const prevPage: PageMeta | null =
      safePageIndex > 0 ? pages[safePageIndex - 1] || null : null;
    const nextPage: PageMeta | null =
      safePageIndex < pages.length - 1 ? pages[safePageIndex + 1] || null : null;

    const setPageRefsLength = useCallback((length: number) => {
      if (pageRefs.current.length !== length) {
        pageRefs.current = Array.from({ length }, (_, index) => pageRefs.current[index] || null);
      }
    }, []);

    const getPageText = useCallback(
      (page: PageMeta | null) => {
        if (!page) return "";
        return content.slice(page.charStart, page.charEnd).trimEnd();
      },
      [content],
    );

    useEffect(() => {
      setPageRefsLength(pages.length);
    }, [pages.length, setPageRefsLength]);

    useEffect(() => {
      if (paragraphRefs.current.length !== paragraphs.length) {
        paragraphRefs.current = Array.from(
          { length: paragraphs.length },
          (_, index) => paragraphRefs.current[index] || null,
        );
      }
    }, [paragraphs.length]);

    const releaseScrollSyncLock = useCallback((delay: number) => {
      if (scrollReleaseTimeoutRef.current) {
        window.clearTimeout(scrollReleaseTimeoutRef.current);
      }
      scrollReleaseTimeoutRef.current = window.setTimeout(() => {
        suppressScrollSyncRef.current = false;
      }, delay);
    }, []);

    const scrollToPageIndex = useCallback(
      (pageIndex: number, behavior: ScrollBehavior = "smooth") => {
        const container = containerRef.current;
        const target = pageRefs.current[pageIndex];
        if (!scrollMode || !container || !target) {
          setActivePageIndex(pageIndex);
          return;
        }
        suppressScrollSyncRef.current = true;
        setActivePageIndex(pageIndex);
        container.scrollTo({
          top: Math.max(0, target.offsetTop - 28),
          behavior,
        });
        releaseScrollSyncLock(behavior === "smooth" ? 320 : 40);
      },
      [releaseScrollSyncLock, scrollMode],
    );

    const scrollToParagraphIndex = useCallback(
      (paragraphIndex: number, behavior: ScrollBehavior = "smooth") => {
        const container = containerRef.current;
        const target = paragraphRefs.current[paragraphIndex];
        if (!scrollMode || !container || !target) return;
        suppressScrollSyncRef.current = true;
        container.scrollTo({
          top: Math.max(0, target.offsetTop - 28),
          behavior,
        });
        releaseScrollSyncLock(behavior === "smooth" ? 320 : 40);
      },
      [releaseScrollSyncLock, scrollMode],
    );

    useEffect(() => {
      const nextIndex = clamp(Math.max(0, Number(initialPageIndex || 0)), 0, Math.max(pages.length - 1, 0));
      setActivePageIndex(nextIndex);
      if (!scrollMode || !paragraphs.length) return;
      const frame = window.requestAnimationFrame(() => {
        const targetParagraphIndex =
          pages.length <= 1
            ? 0
            : Math.round((nextIndex / Math.max(pages.length - 1, 1)) * Math.max(paragraphs.length - 1, 0));
        scrollToParagraphIndex(targetParagraphIndex, "auto");
      });
      return () => window.cancelAnimationFrame(frame);
    }, [
      content,
      currentSectionIndex,
      initialPageIndex,
      pages.length,
      paragraphs.length,
      scrollMode,
      scrollToParagraphIndex,
    ]);

    useEffect(() => {
      if (pendingCharIndexRef.current === null || (!pages.length && !paragraphs.length)) return;
      const sectionStart = getSectionStartOffset(sections[currentSectionIndex]);
      const localCharIndex = Math.max(0, pendingCharIndexRef.current - sectionStart);
      if (scrollMode) {
        const targetParagraphIndex = paragraphs.findIndex(
          (paragraph) => localCharIndex >= paragraph.charStart && localCharIndex < paragraph.charEnd + 1,
        );
        if (targetParagraphIndex >= 0) {
          scrollToParagraphIndex(targetParagraphIndex);
        }
      } else {
        const targetIndex = pages.findIndex(
          (page) => localCharIndex >= page.charStart && localCharIndex < page.charEnd + 1,
        );
        if (targetIndex >= 0) {
          setActivePageIndex(targetIndex);
        }
      }
      pendingCharIndexRef.current = null;
    }, [currentSectionIndex, pages, paragraphs, scrollMode, scrollToParagraphIndex, sections]);

    useEffect(() => {
      const visibleText = scrollMode
        ? paragraphs[Math.min(activePageIndex, Math.max(paragraphs.length - 1, 0))]?.text || content
        : getPageText(currentPage);
      const state = {
        currentPage: safePageIndex + 1,
        totalPages: Math.max(pages.length, 1),
        pageLabel: `Page ${safePageIndex + 1}`,
        chapterLabel: sectionLabel || `Section ${currentSectionIndex + 1}`,
        progressPercent:
          sectionCount > 0
            ? ((currentSectionIndex + safePageIndex / Math.max(pages.length, 1)) / sectionCount) *
              100
            : 0,
        pagesLeftLabel: `${Math.max(pages.length - safePageIndex - 1, 0)} pages left in chapter`,
        visibleText,
        locationPayload: {
          location: currentSectionIndex,
          locationType: "text_section",
          progressPercent:
            sectionCount > 0
              ? ((currentSectionIndex + safePageIndex / Math.max(pages.length, 1)) /
                  sectionCount) *
                100
              : 0,
          pageLabel: sectionLabel || `Section ${currentSectionIndex + 1}`,
          viewState: {
            sectionIndex: currentSectionIndex,
            pageIndex: safePageIndex,
            paragraphIndex: scrollMode ? activePageIndex : undefined,
            flow: scrollMode ? "scrolled" : "paginated",
            spread: "none",
          },
        },
      };
      onStateChange(state);
      const payload: ReaderLocationPayload = state.locationPayload;
      onSaveLocation(payload);
    }, [
      currentPage,
      currentSectionIndex,
      onSaveLocation,
      onStateChange,
      pages.length,
      safePageIndex,
      scrollMode,
      sectionCount,
      sectionLabel,
      paragraphs,
      activePageIndex,
      content,
      getPageText,
    ]);

    const selectText = () => {
      if (!onSelection || !containerRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (!text) return;
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;
      onSelection(text);
    };

    const syncScrollPageIndex = useCallback(() => {
      const container = containerRef.current;
      if (!scrollMode || !container || suppressScrollSyncRef.current) return;
      const anchor = container.scrollTop + Math.max(80, container.clientHeight * 0.18);
      let nextParagraphIndex = 0;
      for (let index = 0; index < paragraphRefs.current.length; index += 1) {
        const node = paragraphRefs.current[index];
        if (!node) continue;
        if (node.offsetTop <= anchor) {
          nextParagraphIndex = index;
        } else {
          break;
        }
      }
      const nextIndex =
        pages.length <= 1 || paragraphRefs.current.length <= 1
          ? nextParagraphIndex
          : Math.round(
              (nextParagraphIndex / Math.max(paragraphRefs.current.length - 1, 1)) *
                Math.max(pages.length - 1, 0),
            );
      if (nextIndex !== activePageIndex) {
        setActivePageIndex(nextIndex);
      }
    }, [activePageIndex, pages.length, scrollMode]);

    const goPrev = () => {
      if (safePageIndex > 0) {
        if (scrollMode) {
          scrollToPageIndex(Math.max(0, safePageIndex - 1));
        } else {
          setActivePageIndex((value) => Math.max(0, value - 1));
        }
        return;
      }
      if (currentSectionIndex > 0) {
        onNavigateSection(currentSectionIndex - 1);
      }
    };

    const goNext = () => {
      if (safePageIndex < pages.length - 1) {
        if (scrollMode) {
          scrollToPageIndex(Math.min(pages.length - 1, safePageIndex + 1));
        } else {
          setActivePageIndex((value) => Math.min(pages.length - 1, value + 1));
        }
        return;
      }
      if (currentSectionIndex < sectionCount - 1) {
        onNavigateSection(currentSectionIndex + 1);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        prev: goPrev,
        next: goNext,
        goToPage: (page) => {
          const targetIndex = clamp(page - 1, 0, Math.max(pages.length - 1, 0));
          if (scrollMode) {
            scrollToPageIndex(targetIndex);
          } else {
            setActivePageIndex(targetIndex);
          }
        },
        goToSearchResult: (result: ReaderSearchResult) => {
          if (typeof result.section_index === "number" && result.section_index !== currentSectionIndex) {
            pendingCharIndexRef.current = Number(result.char_index ?? 0);
            onNavigateSection(result.section_index);
            return;
          }
          if (typeof result.char_index === "number") {
            const sectionStart = getSectionStartOffset(sections[currentSectionIndex]);
            const localChar = Math.max(0, result.char_index - sectionStart);
            if (scrollMode) {
              const targetParagraphIndex = paragraphs.findIndex(
                (paragraph) => localChar >= paragraph.charStart && localChar < paragraph.charEnd + 1,
              );
              if (targetParagraphIndex >= 0) {
                scrollToParagraphIndex(targetParagraphIndex);
              }
            } else {
              const targetIndex = pages.findIndex(
                (page) => localChar >= page.charStart && localChar < page.charEnd + 1,
              );
              if (targetIndex >= 0) {
                setActivePageIndex(targetIndex);
              }
            }
          }
        },
        goToTocTarget: (target) => {
          if (typeof target.sectionIndex === "number") {
            onNavigateSection(target.sectionIndex);
            return;
          }
          if (target.href) {
            const matchedSection = sections.find(
              (section) => section.href && String(section.href) === String(target.href),
            );
            if (matchedSection) {
              onNavigateSection(Number(matchedSection.section_index || 0));
            }
          }
        },
      }),
      [
        currentSectionIndex,
        goNext,
        goPrev,
        onNavigateSection,
        pages,
        paragraphs,
        scrollMode,
        scrollToPageIndex,
        scrollToParagraphIndex,
        sectionCount,
        sections,
      ],
    );

    const align = normalizeAlignment(settings.alignment);
    const inkColor = settings.theme === "dark" ? "#f3f4f6" : settings.theme === "sepia" ? "#34291c" : "#171717";
    const paperColor = settings.theme === "dark" ? "#050505" : settings.theme === "sepia" ? "#f8f0df" : "#ffffff";

    const renderTextLines = (page: PageMeta, pageIndex: number) =>
      page.lines.map((line, lineIndex) => (
        <div
          key={`${pageIndex}-${lineIndex}`}
          className="select-text whitespace-pre-wrap"
          style={{
            minHeight: `${lineHeightPx}px`,
            fontFamily: settings.fontFamily,
            fontSize: `${fontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            textAlign: align,
            color: inkColor,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {renderHighlightedLine(line || " ", searchQuery)}
        </div>
      ));

    const renderParagraph = (paragraph: ParagraphMeta, paragraphIndex: number) => (
      <p
        key={`paragraph-${paragraphIndex}`}
        ref={(node) => {
          paragraphRefs.current[paragraphIndex] = node;
        }}
        className="select-text whitespace-pre-wrap"
        style={{
          margin: paragraphIndex === 0 ? "0" : `${lineHeightPx * 0.9}px 0 0`,
          fontFamily: settings.fontFamily,
          fontSize: `${fontSizePx}px`,
          lineHeight: `${lineHeightPx}px`,
          textAlign: align,
          color: inkColor,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {renderHighlightedLine(paragraph.text, searchQuery)}
      </p>
    );

    const renderPageText = (page: PageMeta | null) => {
      const pageText = getPageText(page);
      if (!pageText) {
        return <div className="text-lg text-slate-400">No content available.</div>;
      }
      return (
        <div
          className="select-text whitespace-pre-wrap"
          style={{
            fontFamily: settings.fontFamily,
            fontSize: `${fontSizePx}px`,
            lineHeight: `${lineHeightPx}px`,
            textAlign: align,
            color: inkColor,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {renderHighlightedLine(pageText, searchQuery)}
        </div>
      );
    };

    const renderPagedShell = (page: PageMeta | null, mode: "peek" | "active", pageIndex: number) => {
      const isActive = mode === "active";
      return (
        <div
          className={`relative overflow-hidden ${isActive ? "opacity-100" : "opacity-72"}`}
          style={{
            width: isActive ? `${planeWidth}px` : `${Math.max(180, planeWidth * 0.28)}px`,
            minHeight: `${Math.max(520, innerHeight + 92)}px`,
            color: inkColor,
            background: paperColor,
            borderRadius: isActive ? "18px" : "14px",
            transform: isActive ? "scale(1)" : "scale(0.95)",
            boxShadow: isActive
              ? "0 18px 46px rgba(15, 23, 42, 0.12)"
              : "0 14px 36px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div className="absolute bottom-6 left-8 text-sm text-slate-500">
            {Math.max(pages.length - pageIndex - 1, 0)} pages left in chapter
          </div>
          <div className="absolute bottom-6 right-8 text-sm text-slate-500">
            {Math.round(
              ((currentSectionIndex + pageIndex / Math.max(pages.length, 1)) /
                Math.max(sectionCount, 1)) *
                100,
            )}
            %
          </div>
          <div
            className="mx-auto h-full w-full"
            style={{
              padding: isActive ? "48px 48px 88px" : "40px 28px 72px",
              background: paperColor,
            }}
          >
            <div className="h-full overflow-y-auto pr-2">{renderPageText(page)}</div>
          </div>
        </div>
      );
    };

    const renderChapterFooter = () => {
      if (!scrollMode || !desktopLayout) return null;
      return (
        <div className="mt-16 flex justify-end text-[#202124]">
          <div className="flex flex-col items-end gap-3 text-[1.08rem]">
            {currentSectionIndex < sectionCount - 1 ? (
              <button
                type="button"
                onClick={() => onNavigateSection(currentSectionIndex + 1)}
                className="underline decoration-black/25 underline-offset-[6px] transition hover:text-[#5670b5]"
              >
                Next chapter →
              </button>
            ) : null}
            {onOpenContents ? (
              <button
                type="button"
                onClick={onOpenContents}
                className="underline decoration-black/25 underline-offset-[6px] transition hover:text-[#5670b5]"
              >
                Table of contents ↑
              </button>
            ) : null}
          </div>
        </div>
      );
    };

    if (scrollMode) {
      return (
        <div
          ref={containerRef}
          className="relative h-full min-h-0 overflow-x-hidden overflow-y-auto px-0 pb-20 pt-0"
          onMouseUp={selectText}
          onTouchEnd={selectText}
          onScroll={syncScrollPageIndex}
          style={{ background: paperColor }}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-base text-slate-500">
              Loading section...
            </div>
          ) : (
            <div className="min-h-full w-full">
              <div
                className="mx-auto w-full px-6 pb-20 pt-8 sm:px-10 sm:pb-28 sm:pt-10"
                style={{
                  maxWidth: `${contentColumnWidth + 80}px`,
                  color: inkColor,
                }}
              >
                <div className="mx-auto" style={{ maxWidth: `${contentColumnWidth}px` }}>
                  {paragraphs.length === 0 ? (
                    <div className="text-lg text-slate-400">No content available.</div>
                  ) : (
                    paragraphs.map((paragraph, paragraphIndex) =>
                      renderParagraph(paragraph, paragraphIndex),
                    )
                  )}
                  {renderChapterFooter()}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (desktopLayout) {
      return (
        <div
          ref={containerRef}
          className="relative flex h-full min-h-0 items-stretch justify-center overflow-hidden px-0 py-3"
          onMouseUp={selectText}
          onTouchEnd={selectText}
          style={{ background: paperColor }}
        >
          {isLoading ? (
            <div className="text-base text-slate-500">Loading section...</div>
          ) : (
            <div className="mx-auto flex h-full w-full items-stretch justify-center">
              <div
                className="mx-auto h-full w-full overflow-hidden px-6 pb-14 pt-8 sm:px-10 sm:pb-16 sm:pt-10"
                style={{
                  color: inkColor,
                }}
              >
                <div
                  className="mx-auto h-full w-full overflow-y-auto pr-2"
                  style={{
                    maxWidth: `${contentColumnWidth}px`,
                  }}
                >
                  {renderPageText(currentPage)}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="relative flex h-full min-h-0 items-center justify-center overflow-hidden px-3 py-6 sm:px-6"
        onMouseUp={selectText}
        onTouchEnd={selectText}
      >
        {isLoading ? (
          <div className="text-base text-slate-500">Loading section...</div>
        ) : (
          <div className="flex w-full max-w-[1680px] items-center justify-center gap-6 overflow-hidden">
            {usePeekLayout ? (
              <div className="hidden flex-1 justify-end xl:flex">
                {renderPagedShell(prevPage, "peek", Math.max(safePageIndex - 1, 0))}
              </div>
            ) : null}
            {renderPagedShell(currentPage, "active", safePageIndex)}
            {usePeekLayout ? (
              <div className="hidden flex-1 justify-start xl:flex">
                {renderPagedShell(nextPage, "peek", Math.min(safePageIndex + 1, pages.length - 1))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);
