import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EpubView } from "react-reader";
import type { ReaderBook, ReaderSearchResult, TocItem } from "../../types/readerBackendTypes";
import {
  type ReaderSurfaceCommonProps,
  type ReaderSurfaceHandle,
} from "./playBooksReaderShared";

interface PlayBooksEpubSurfaceProps extends ReaderSurfaceCommonProps {
  book: ReaderBook;
  initialLocation: string | number | null;
}

function normalizeToc(tocData: any[]): TocItem[] {
  return (tocData || []).map((item) => ({
    label: String(item?.label || ""),
    href: String(item?.href || ""),
  }));
}

export default forwardRef<ReaderSurfaceHandle, PlayBooksEpubSurfaceProps>(
  function PlayBooksEpubSurface(
    {
      book,
      initialLocation,
      onSaveLocation,
      onStateChange,
      onSelection,
      onOpenContents,
      settings,
      presentationMode,
      platformLayout,
    },
    ref,
  ) {
    const readerRef = useRef<any>(null);
    const renditionRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [location, setLocation] = useState<string | number | null>(initialLocation);
    const [toc, setToc] = useState<TocItem[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [chapterLabel, setChapterLabel] = useState(book.title);
    const [currentHref, setCurrentHref] = useState("");
    const [, setVisibleText] = useState("");
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const pagedMode = presentationMode === "paged";
    const desktopLayout = platformLayout === "desktop";

    const applyThemeToContents = useCallback(
      (contents: any) => {
        const doc = contents?.document;
        if (!doc) return;

        const background =
          settings.theme === "dark"
            ? "#050505"
            : settings.theme === "sepia"
              ? "#f8f0df"
              : "#ffffff";
        const color =
          settings.theme === "dark"
            ? "#f3f4f6"
            : settings.theme === "sepia"
              ? "#3a2f20"
              : "#171717";
        const alignment = settings.alignment === "left" ? "left" : "justify";
        const overflowMode = pagedMode ? "auto" : "visible";
        const pagedInlineInset =
          desktopLayout
            ? Math.max(6, Math.min(10, Math.round(viewportSize.width * 0.0065)))
            : 8;
        const pagedTopInset = desktopLayout ? 8 : 10;
        const pagedBottomInset = desktopLayout ? 18 : 20;
        const pagedContentMaxWidth = desktopLayout
          ? `${Math.max(960, Math.min(1240, viewportSize.width - 40))}px`
          : "100%";
        const scrollBodyMaxWidth = desktopLayout ? "760px" : "100%";
        const scrollBodyPadding = desktopLayout ? "28px 0 112px" : "24px 0 96px";

        let styleTag = doc.getElementById("reader-play-books-style");
        if (!styleTag) {
          styleTag = doc.createElement("style");
          styleTag.id = "reader-play-books-style";
          doc.head.appendChild(styleTag);
        }

        styleTag.innerHTML = `
          html, body {
            margin: 0 !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 100% !important;
            background: ${background} !important;
            color: ${color} !important;
            overflow-y: ${overflowMode} !important;
            overflow-x: hidden !important;
          }
          * {
            box-sizing: border-box !important;
          }
          body {
            margin: 0 !important;
            padding: ${
              pagedMode
                ? `${pagedTopInset}px ${pagedInlineInset}px ${pagedBottomInset}px`
                : scrollBodyPadding
            } !important;
            max-width: ${pagedMode ? "none" : scrollBodyMaxWidth} !important;
            margin-left: ${pagedMode ? "0" : "auto"} !important;
            margin-right: ${pagedMode ? "0" : "auto"} !important;
            font-size: ${Math.max(105, settings.fontSize)}% !important;
            line-height: ${settings.lineHeight} !important;
            text-align: ${alignment} !important;
            overflow-wrap: break-word !important;
            word-break: normal !important;
            hyphens: auto !important;
            writing-mode: horizontal-tb !important;
            white-space: normal !important;
          }
          section, article, main, div, p, blockquote, li, h1, h2, h3, h4, h5, h6 {
            max-width: 100% !important;
          }
          body > * {
            max-width: ${
              pagedMode
                ? `min(100%, ${pagedContentMaxWidth})`
                : "100%"
            } !important;
            margin-left: ${pagedMode ? "auto" : "inherit"} !important;
            margin-right: ${pagedMode ? "auto" : "inherit"} !important;
          }
          p, blockquote, li {
            widows: 2 !important;
            orphans: 2 !important;
          }
          body, p, div, span, li, blockquote, h1, h2, h3, h4, h5, h6, td, th {
            color: ${color} !important;
            font-family: ${settings.fontFamily} !important;
            line-height: ${settings.lineHeight} !important;
            text-align: ${alignment} !important;
          }
          img, svg, video, canvas, table, object, embed, iframe, figure, pre, code {
            max-width: 100% !important;
            height: auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          figure, img, table, pre {
            clear: both !important;
          }
          figure, table, pre {
            break-inside: avoid-column !important;
            page-break-inside: avoid !important;
          }
          table {
            display: block !important;
            width: auto !important;
            overflow-x: auto !important;
          }
          pre, code, a {
            white-space: pre-wrap !important;
            word-break: break-word !important;
          }
          [style*="float:"], [align="left"], [align="right"] {
            float: none !important;
            clear: both !important;
          }
          ::selection {
            background: #f3dd73 !important;
          }
        `;
      },
      [
        desktopLayout,
        pagedMode,
        settings.alignment,
        settings.fontFamily,
        settings.fontSize,
        settings.lineHeight,
        settings.theme,
        viewportSize.width,
      ],
    );

    const syncVisibleText = useCallback(() => {
      const rendition = renditionRef.current;
      const contents = rendition?.getContents?.() || [];
      const text = contents
        .map((content: any) => String(content?.document?.body?.innerText || "").trim())
        .filter(Boolean)
        .join("\n\n")
        .trim();
      setVisibleText(text);
      return text;
    }, []);

    const syncRelocation = useCallback(
      (loc: any) => {
        const displayedPage = Number(loc?.start?.displayed?.page || 1);
        const displayedTotal = Number(loc?.start?.displayed?.total || 1);
        const cfi = String(loc?.start?.cfi || location || "");
        const locations = renditionRef.current?.book?.locations;
        const locationTotal =
          typeof locations?.length === "function"
            ? Number(locations.length())
            : Number(locations?.total || 0);
        const percentageFromCfi = locations?.percentageFromCfi?.(cfi);
        const safePercentage =
          Number.isFinite(percentageFromCfi) && percentageFromCfi >= 0
            ? Number(percentageFromCfi)
            : displayedTotal > 0
              ? (displayedPage - 1) / Math.max(displayedTotal - 1, 1)
              : 0;
        const derivedTotal = locationTotal > 0 ? locationTotal : displayedTotal || 1;
        const derivedPage = Math.min(
          Math.max(1, Math.round(safePercentage * Math.max(derivedTotal - 1, 1)) + 1),
          Math.max(derivedTotal, 1),
        );
        const href = String(loc?.start?.href || "");
        setCurrentHref(href);
        const matchedChapter =
          toc.find((item) => item.href && href && href.startsWith(item.href.replace(/#.*$/, ""))) ||
          toc.find((item) => item.href === href);
        const nextVisibleText = syncVisibleText();
        const locationPayload = {
          location: cfi,
          locationType: "epub_cfi",
          progressPercent: safePercentage * 100,
          pageLabel: matchedChapter?.label || chapterLabel || book.title,
          viewState: {
            page: derivedPage,
            total: derivedTotal,
            displayedPage: displayedPage || 1,
            displayedTotal: displayedTotal || 1,
            flow: pagedMode ? "paginated" : "scrolled",
          },
        };
        setCurrentPage(derivedPage);
        setTotalPages(Math.max(derivedTotal, 1));
        setChapterLabel(matchedChapter?.label || chapterLabel || book.title);
        onStateChange({
          currentPage: derivedPage,
          totalPages: Math.max(derivedTotal, 1),
          pageLabel: `Page ${derivedPage}`,
          chapterLabel: matchedChapter?.label || chapterLabel || book.title,
          progressPercent: safePercentage * 100,
          pagesLeftLabel: `${Math.max(Math.max(derivedTotal, 1) - derivedPage, 0)} pages left in book`,
          visibleText: nextVisibleText,
          locationPayload,
        });
        onSaveLocation(locationPayload);
      },
      [book.title, chapterLabel, location, onSaveLocation, onStateChange, pagedMode, syncVisibleText, toc],
    );

    const configureRendition = useCallback(
      (rendition: any) => {
        renditionRef.current = rendition;
        rendition.hooks.content.register((contents: any) => {
          applyThemeToContents(contents);
        });
        rendition.on("selected", (cfiRange: string) => {
          const range = rendition.getRange?.(cfiRange);
          const text = String(range?.toString?.() || "").trim();
          if (text && onSelection) {
            onSelection(text);
          }
        });
        rendition.on("relocated", syncRelocation);

        Promise.resolve(rendition.book?.ready)
          .then(async () => {
            const locations = rendition.book?.locations;
            const generatedCount =
              typeof locations?.length === "function"
                ? Number(locations.length())
                : Number(locations?.total || 0);
            if (locations && generatedCount <= 0) {
              await locations.generate?.(1600);
            }
            const currentLocation = rendition.currentLocation?.();
            if (currentLocation) {
              syncRelocation(currentLocation);
            }
          })
          .catch((error) => {
            console.error("EPUB locations generation failed", error);
          });
      },
      [applyThemeToContents, onSelection, syncRelocation],
    );

    useLayoutEffect(() => {
      const viewport = viewportRef.current;
      const rendition = renditionRef.current;
      if (!viewport || !rendition?.resize) return;

      const resize = () => {
        const rect = viewport.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setViewportSize({
            width: Math.floor(rect.width),
            height: Math.floor(rect.height),
          });
          rendition.resize(rect.width, rect.height);
        }
      };

      resize();
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(() => resize());
      observer.observe(viewport);
      return () => observer.disconnect();
    }, [pagedMode, presentationMode, settings.fontSize, settings.lineHeight]);

    useEffect(() => {
      const rendition = renditionRef.current;
      if (!rendition?.getContents) return;
      rendition.getContents().forEach((contents: any) => applyThemeToContents(contents));
    }, [applyThemeToContents]);

    useImperativeHandle(
      ref,
      () => ({
        prev: () => {
          readerRef.current?.prevPage?.();
          renditionRef.current?.prev?.();
        },
        next: () => {
          readerRef.current?.nextPage?.();
          renditionRef.current?.next?.();
        },
        goToPage: async (page) => {
          const rendition = renditionRef.current;
          const locations = rendition?.book?.locations;
          if (!locations?.cfiFromPercentage) return;
          const percentage =
            totalPages <= 1 ? 0 : Math.min(Math.max((page - 1) / Math.max(totalPages - 1, 1), 0), 1);
          const cfi = locations.cfiFromPercentage(percentage);
          if (cfi) {
            await rendition.display(cfi);
          }
        },
        goToSearchResult: async (result: ReaderSearchResult) => {
          if (result.href && renditionRef.current) {
            await renditionRef.current.display(result.href);
          }
        },
        goToTocTarget: async (target) => {
          if (target.href && renditionRef.current) {
            await renditionRef.current.display(target.href);
          }
        },
      }),
      [totalPages],
    );

    const epubOptions = useMemo(
      () =>
        ({
          flow: pagedMode ? "paginated" : "scrolled",
          manager: pagedMode ? "default" : "continuous",
          spread: "none",
          width: "100%",
          height: "100%",
          allowPopups: true,
        } as any),
      [pagedMode],
    );

    const currentTocIndex = toc.findIndex(
      (item) =>
        item.href &&
        currentHref &&
        currentHref.startsWith(item.href.replace(/#.*$/, "")),
    );
    const nextTocItem =
      currentTocIndex >= 0 && currentTocIndex < toc.length - 1
        ? toc[currentTocIndex + 1]
        : null;
    const showMobilePagedShell = pagedMode && !desktopLayout;
    const viewportPadding = pagedMode
      ? desktopLayout
        ? "2px 2px 10px"
        : "20px 20px 34px"
      : desktopLayout
        ? "24px 0 96px"
        : "20px 0 84px";
    const viewportMaxWidth = pagedMode
      ? showMobilePagedShell
        ? undefined
        : "min(100%, 1240px)"
      : desktopLayout
        ? "840px"
        : "100%";

    return (
      <div
        ref={containerRef}
        className={`relative flex h-full min-h-0 justify-center px-0 py-0 ${
          pagedMode
            ? "items-center overflow-hidden"
            : "items-start overflow-x-hidden overflow-y-auto pb-16 pt-12 sm:pb-24 sm:pt-16"
        }`}
      >
        <div
          className={`relative mx-auto w-full ${
            pagedMode
              ? showMobilePagedShell
                ? "h-full min-h-0 max-w-[1040px] overflow-hidden rounded-[18px] shadow-[0_14px_32px_rgba(15,23,42,0.1)]"
                : "h-full min-h-0 overflow-hidden"
              : ""
          }`}
          style={{
            background: pagedMode
              ? settings.theme === "dark"
                ? "#050505"
                : settings.theme === "sepia"
                  ? "#f8f0df"
                  : "#ffffff"
              : "transparent",
            maxWidth: undefined,
          }}
        >
          <div
            className={`mx-auto ${
              pagedMode && desktopLayout
                ? "h-full w-full"
                : pagedMode
                  ? "h-full"
                  : "min-h-[calc(100vh-180px)]"
            }`}
            style={{
              maxWidth: viewportMaxWidth,
            }}
          >
            <div
              ref={viewportRef}
              className={`h-full min-h-0 w-full ${pagedMode ? "" : "mx-auto"}`}
              style={{
                padding: viewportPadding,
                maxWidth: viewportMaxWidth,
                boxSizing: "border-box",
              }}
            >
              <EpubView
                key={`${book.filename}:${presentationMode}:${platformLayout}:${settings.fontFamily}:${settings.fontSize}:${settings.lineHeight}:${settings.alignment}:${settings.theme}`}
                ref={readerRef}
                url={book.url}
                location={location}
                tocChanged={(value) => setToc(normalizeToc(value))}
                locationChanged={(value) => {
                  setLocation(value);
                }}
                getRendition={configureRendition}
                epubOptions={epubOptions}
                epubViewStyles={{
                  viewHolder: {
                    position: "relative",
                    height: "100%",
                    width: "100%",
                    overflowX: "hidden",
                    overflowY: "hidden",
                  },
                  view: {
                    height: "100%",
                    width: "100%",
                    overflowX: "hidden",
                    overflowY: pagedMode ? "hidden" : "visible",
                  },
                }}
                loadingView={
                  <div className="flex h-full items-center justify-center text-base text-slate-500">
                    Loading EPUB...
                  </div>
                }
                errorView={
                  <div className="flex h-full items-center justify-center text-base text-rose-600">
                    Could not render EPUB.
                  </div>
                }
              />
            </div>
          </div>
          {!pagedMode ? (
            <div className="mx-auto mt-12 max-w-[760px] px-2 text-[#202124]">
              <div className="flex justify-end">
                <div className="flex flex-col items-end gap-3 text-[1.08rem]">
                  {nextTocItem ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (nextTocItem.href && renditionRef.current) {
                          void renditionRef.current.display(nextTocItem.href);
                        }
                      }}
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
            </div>
          ) : null}
        </div>
      </div>
    );
  },
);
