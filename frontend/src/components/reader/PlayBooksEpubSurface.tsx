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
import type {
    ReaderBook,
    ReaderSearchResult,
    TocItem,
} from "../../types/readerBackendTypes";
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
            onContextMenuRequest,
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
        const [location, setLocation] = useState<string | number | null>(
            initialLocation,
        );
        const [toc, setToc] = useState<TocItem[]>([]);
        const [currentPage, setCurrentPage] = useState(1);
        const [totalPages, setTotalPages] = useState(1);
        const [chapterLabel, setChapterLabel] = useState(book.title);
        const [currentHref, setCurrentHref] = useState("");
        const [, setVisibleText] = useState("");
        const [viewportSize, setViewportSize] = useState({
            width: 0,
            height: 0,
        });
        const pagedMode = presentationMode === "paged";
        const desktopLayout = platformLayout === "desktop";
        const desktopSectionPaging = pagedMode && desktopLayout;

        const getActiveContents = useCallback(() => {
            const contents = renditionRef.current?.getContents?.() || [];
            return contents[0] || null;
        }, []);

        const getScrollMetrics = useCallback(() => {
            const activeContents = getActiveContents();
            const doc = activeContents?.document;
            const scrollingElement =
                doc?.scrollingElement ||
                doc?.documentElement ||
                doc?.body ||
                null;
            if (!scrollingElement) return null;
            const clientHeight = Math.max(
                Number((activeContents?.window?.innerHeight as number) || 0),
                Number(scrollingElement.clientHeight || 0),
                1,
            );
            const scrollTop = Math.max(
                0,
                Number(scrollingElement.scrollTop || 0),
            );
            const scrollHeight = Math.max(
                Number(scrollingElement.scrollHeight || clientHeight),
                clientHeight,
            );
            const totalVirtualPages = Math.max(
                1,
                Math.ceil(scrollHeight / clientHeight),
            );
            const currentVirtualPage = Math.min(
                totalVirtualPages,
                Math.max(1, Math.floor(scrollTop / clientHeight) + 1),
            );
            return {
                scrollingElement,
                clientHeight,
                scrollTop,
                scrollHeight,
                totalVirtualPages,
                currentVirtualPage,
            };
        }, [getActiveContents]);

        const getCurrentTocState = useCallback(() => {
            const liveHref = String(
                renditionRef.current?.currentLocation?.()?.start?.href ||
                    currentHref ||
                    "",
            );
            const tocIndex = toc.findIndex(
                (item) =>
                    item.href &&
                    liveHref &&
                    liveHref.startsWith(item.href.replace(/#.*$/, "")),
            );
            return {
                tocIndex,
                prevItem:
                    tocIndex > 0 && tocIndex < toc.length
                        ? toc[tocIndex - 1]
                        : null,
                nextItem:
                    tocIndex >= 0 && tocIndex < toc.length - 1
                        ? toc[tocIndex + 1]
                        : null,
            };
        }, [currentHref, toc]);

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
                const alignment =
                    settings.alignment === "left" ? "left" : "justify";
                const overflowMode = desktopSectionPaging
                    ? "auto"
                    : pagedMode
                      ? "hidden"
                      : "visible";
                const pagedInlineInset = desktopLayout ? 10 : 1;
                const pagedTopInset = desktopLayout ? 6 : 10;
                const pagedBottomInset = desktopLayout ? 12 : 18;
                const desktopPagedBodyMaxWidth = "600px";
                const scrollBodyMaxWidth = desktopLayout ? "760px" : "100%";
                const scrollBodyPadding = desktopLayout
                    ? "28px 0 112px"
                    : "24px 0 96px";

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
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            scroll-behavior: smooth !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
          }
          html::-webkit-scrollbar,
          body::-webkit-scrollbar,
          *::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
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
            max-width: ${
                desktopSectionPaging
                    ? desktopPagedBodyMaxWidth
                    : pagedMode
                      ? "none"
                      : scrollBodyMaxWidth
            } !important;
            margin-left: ${
                desktopSectionPaging || !pagedMode ? "auto" : "0"
            } !important;
            margin-right: ${
                desktopSectionPaging || !pagedMode ? "auto" : "0"
            } !important;
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
            max-width: none !important;
          }
          body > * {
            max-width: 100% !important;
            width: auto !important;
            margin-left: ${desktopSectionPaging ? "auto" : "0"} !important;
            margin-right: ${desktopSectionPaging ? "auto" : "0"} !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          body > * > *,
          body > * > * > * {
            max-width: 100% !important;
            margin-left: ${desktopSectionPaging ? "auto" : "0"} !important;
            margin-right: ${desktopSectionPaging ? "auto" : "0"} !important;
          }
          section, article, main, div {
            width: ${desktopSectionPaging ? "auto" : "100%"} !important;
            margin-left: ${desktopSectionPaging ? "auto" : "0"} !important;
            margin-right: ${desktopSectionPaging ? "auto" : "0"} !important;
          }
          p, blockquote, ul, ol, li, h1, h2, h3, h4, h5, h6 {
            width: auto !important;
            max-width: 100% !important;
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
          [style*="margin-left:auto"], [style*="margin-right:auto"] {
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
          ::selection {
            background: #f3dd73 !important;
          }
        `;
            },
            [
                desktopLayout,
                desktopSectionPaging,
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
                .map((content: any) =>
                    String(content?.document?.body?.innerText || "").trim(),
                )
                .filter(Boolean)
                .join("\n\n")
                .trim();
            setVisibleText(text);
            return text;
        }, []);

        const syncScrollPagingState = useCallback(
            (
                matchedChapterLabel: string,
                chapterIndex: number,
                locationValue: string | number | null,
            ) => {
                if (!desktopSectionPaging) return;
                const metrics = getScrollMetrics();
                if (!metrics) return;
                const progressWithinSection =
                    metrics.totalVirtualPages <= 1
                        ? 0
                        : (metrics.currentVirtualPage - 1) /
                          Math.max(metrics.totalVirtualPages - 1, 1);
                const totalSections = Math.max(toc.length, 1);
                const overallProgress =
                    totalSections <= 1
                        ? progressWithinSection
                        : (Math.max(0, chapterIndex) + progressWithinSection) /
                          Math.max(totalSections - 1, 1);
                const visibleText = syncVisibleText();
                const locationPayload = {
                    location: locationValue || location || "",
                    locationType: "epub_cfi",
                    progressPercent:
                        Math.max(0, Math.min(overallProgress, 1)) * 100,
                    pageLabel: matchedChapterLabel || book.title,
                    viewState: {
                        page: metrics.currentVirtualPage,
                        total: metrics.totalVirtualPages,
                        sectionIndex: Math.max(0, chapterIndex),
                        sectionPage: metrics.currentVirtualPage,
                        sectionPageTotal: metrics.totalVirtualPages,
                        sectionScrollTop: metrics.scrollTop,
                        flow: "scrolled-doc",
                    },
                };
                setCurrentPage(metrics.currentVirtualPage);
                setTotalPages(metrics.totalVirtualPages);
                setChapterLabel(matchedChapterLabel || book.title);
                onStateChange({
                    currentPage: metrics.currentVirtualPage,
                    totalPages: metrics.totalVirtualPages,
                    pageLabel: `Page ${metrics.currentVirtualPage}`,
                    chapterLabel: matchedChapterLabel || book.title,
                    progressPercent: locationPayload.progressPercent,
                    pagesLeftLabel: `${Math.max(metrics.totalVirtualPages - metrics.currentVirtualPage, 0)} pages left in chapter`,
                    visibleText,
                    locationPayload,
                });
                onSaveLocation(locationPayload);
            },
            [
                book.title,
                desktopSectionPaging,
                getScrollMetrics,
                location,
                onSaveLocation,
                onStateChange,
                syncVisibleText,
                toc.length,
            ],
        );

        const syncRelocation = useCallback(
            (loc: any) => {
                const displayedPage = Number(loc?.start?.displayed?.page || 1);
                const displayedTotal = Number(
                    loc?.start?.displayed?.total || 1,
                );
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
                          ? (displayedPage - 1) /
                            Math.max(displayedTotal - 1, 1)
                          : 0;
                const derivedTotal =
                    locationTotal > 0 ? locationTotal : displayedTotal || 1;
                const derivedPage = Math.min(
                    Math.max(
                        1,
                        Math.round(
                            safePercentage * Math.max(derivedTotal - 1, 1),
                        ) + 1,
                    ),
                    Math.max(derivedTotal, 1),
                );
                const href = String(loc?.start?.href || "");
                setCurrentHref(href);
                const matchedIndex = toc.findIndex(
                    (item) =>
                        item.href &&
                        href &&
                        href.startsWith(item.href.replace(/#.*$/, "")),
                );
                const matchedChapter =
                    (matchedIndex >= 0 ? toc[matchedIndex] : null) ||
                    toc.find((item) => item.href === href);
                if (desktopSectionPaging) {
                    setChapterLabel(
                        matchedChapter?.label || chapterLabel || book.title,
                    );
                    setTimeout(() => {
                        syncScrollPagingState(
                            matchedChapter?.label || chapterLabel || book.title,
                            matchedIndex >= 0 ? matchedIndex : 0,
                            cfi,
                        );
                    }, 0);
                    return;
                }
                const nextVisibleText = syncVisibleText();
                const locationPayload = {
                    location: cfi,
                    locationType: "epub_cfi",
                    progressPercent: safePercentage * 100,
                    pageLabel:
                        matchedChapter?.label || chapterLabel || book.title,
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
                setChapterLabel(
                    matchedChapter?.label || chapterLabel || book.title,
                );
                onStateChange({
                    currentPage: derivedPage,
                    totalPages: Math.max(derivedTotal, 1),
                    pageLabel: `Page ${derivedPage}`,
                    chapterLabel:
                        matchedChapter?.label || chapterLabel || book.title,
                    progressPercent: safePercentage * 100,
                    pagesLeftLabel: `${Math.max(Math.max(derivedTotal, 1) - derivedPage, 0)} pages left in book`,
                    visibleText: nextVisibleText,
                    locationPayload,
                });
                onSaveLocation(locationPayload);
            },
            [
                book.title,
                chapterLabel,
                desktopSectionPaging,
                location,
                onSaveLocation,
                onStateChange,
                pagedMode,
                syncScrollPagingState,
                syncVisibleText,
                toc,
            ],
        );

        const configureRendition = useCallback(
            (rendition: any) => {
                renditionRef.current = rendition;
                rendition.hooks.content.register((contents: any) => {
                    applyThemeToContents(contents);
                    const doc = contents?.document;
                    if (platformLayout === "desktop" && doc) {
                        const handleContextMenu = (event: MouseEvent) => {
                            event.preventDefault();
                            onContextMenuRequest?.();
                        };
                        doc.addEventListener("contextmenu", handleContextMenu);
                    }
                    if (desktopSectionPaging) {
                        const scrollingElement =
                            doc?.scrollingElement ||
                            doc?.documentElement ||
                            doc?.body ||
                            null;
                        const win = contents?.window;
                        if (scrollingElement && win?.requestAnimationFrame) {
                            let ticking = false;
                            const handleScroll = () => {
                                if (ticking) return;
                                ticking = true;
                                win.requestAnimationFrame(() => {
                                    ticking = false;
                                    const currentLocation =
                                        rendition.currentLocation?.();
                                    const href = String(
                                        currentLocation?.start?.href || "",
                                    );
                                    const matchedIndex = toc.findIndex(
                                        (item) =>
                                            item.href &&
                                            href &&
                                            href.startsWith(
                                                item.href.replace(/#.*$/, ""),
                                            ),
                                    );
                                    syncScrollPagingState(
                                        (matchedIndex >= 0
                                            ? toc[matchedIndex]?.label
                                            : chapterLabel) || book.title,
                                        matchedIndex >= 0 ? matchedIndex : 0,
                                        currentLocation?.start?.cfi || location,
                                    );
                                });
                            };
                            scrollingElement.addEventListener(
                                "scroll",
                                handleScroll,
                                { passive: true },
                            );
                        }
                    }
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
                        console.error(
                            "EPUB locations generation failed",
                            error,
                        );
                    });
            },
            [
                applyThemeToContents,
                book.title,
                chapterLabel,
                desktopSectionPaging,
                location,
                onContextMenuRequest,
                onSelection,
                platformLayout,
                syncRelocation,
                syncScrollPagingState,
                toc,
            ],
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
        }, [
            pagedMode,
            presentationMode,
            settings.fontSize,
            settings.lineHeight,
        ]);

        useEffect(() => {
            const rendition = renditionRef.current;
            if (!rendition?.getContents) return;
            rendition
                .getContents()
                .forEach((contents: any) => applyThemeToContents(contents));
        }, [applyThemeToContents]);

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

        useImperativeHandle(
            ref,
            () => ({
                prev: () => {
                    if (desktopSectionPaging) {
                        const prevTocItem = getCurrentTocState().prevItem;
                        if (prevTocItem?.href && renditionRef.current) {
                            void renditionRef.current.display(prevTocItem.href);
                            return;
                        }
                    }
                    readerRef.current?.prevPage?.();
                    renditionRef.current?.prev?.();
                },
                next: () => {
                    if (desktopSectionPaging) {
                        const nextItem = getCurrentTocState().nextItem;
                        if (nextItem?.href && renditionRef.current) {
                            void renditionRef.current.display(nextItem.href);
                            return;
                        }
                    }
                    readerRef.current?.nextPage?.();
                    renditionRef.current?.next?.();
                },
                goToPage: async (page) => {
                    if (desktopSectionPaging) {
                        const metrics = getScrollMetrics();
                        if (metrics) {
                            metrics.scrollingElement.scrollTo({
                                top: Math.max(
                                    0,
                                    Math.min(
                                        metrics.scrollHeight -
                                            metrics.clientHeight,
                                        (page - 1) * metrics.clientHeight,
                                    ),
                                ),
                                behavior: "smooth",
                            });
                        }
                        return;
                    }
                    const rendition = renditionRef.current;
                    const locations = rendition?.book?.locations;
                    if (!locations?.cfiFromPercentage) return;
                    const percentage =
                        totalPages <= 1
                            ? 0
                            : Math.min(
                                  Math.max(
                                      (page - 1) / Math.max(totalPages - 1, 1),
                                      0,
                                  ),
                                  1,
                              );
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
            [
                desktopSectionPaging,
                getCurrentTocState,
                getScrollMetrics,
                totalPages,
            ],
        );

        const epubOptions = useMemo(
            () =>
                ({
                    flow: desktopSectionPaging
                        ? "scrolled-doc"
                        : pagedMode
                          ? "paginated"
                          : "scrolled",
                    manager: desktopSectionPaging
                        ? "default"
                        : pagedMode
                          ? "default"
                          : "continuous",
                    spread: "none",
                    width: "100%",
                    height: "100%",
                    allowPopups: true,
                }) as any,
            [desktopSectionPaging, pagedMode],
        );
        const showMobilePagedShell = pagedMode && !desktopLayout;
        const viewportPadding = pagedMode
            ? desktopLayout
                ? "0 0 8px"
                : "20px 20px 34px"
            : desktopLayout
              ? "24px 0 96px"
              : "20px 0 84px";
        const viewportMaxWidth = pagedMode
            ? showMobilePagedShell
                ? undefined
                : "100%"
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
                            data-reader-epub-viewport="true"
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
                                tocChanged={(value) =>
                                    setToc(normalizeToc(value))
                                }
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
                                        scrollbarWidth: "none",
                                        msOverflowStyle: "none",
                                    },
                                    view: {
                                        height: "100%",
                                        width: "100%",
                                        overflowX: "hidden",
                                        overflowY: desktopSectionPaging
                                            ? "auto"
                                            : pagedMode
                                              ? "hidden"
                                              : "visible",
                                        scrollbarWidth: "none",
                                        msOverflowStyle: "none",
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
                    <style>{`
            [data-reader-epub-viewport="true"],
            [data-reader-epub-viewport="true"] *,
            [data-reader-epub-viewport="true"] iframe {
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
            [data-reader-epub-viewport="true"]::-webkit-scrollbar,
            [data-reader-epub-viewport="true"] *::-webkit-scrollbar,
            [data-reader-epub-viewport="true"] iframe::-webkit-scrollbar {
              width: 0;
              height: 0;
              display: none;
            }
          `}</style>
                    {!pagedMode ? (
                        <div className="mx-auto mt-12 max-w-[760px] px-2 text-[#202124]">
                            <div className="flex justify-end">
                                <div className="flex flex-col items-end gap-3 text-[1.08rem]">
                                    {nextTocItem ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (
                                                    nextTocItem.href &&
                                                    renditionRef.current
                                                ) {
                                                    void renditionRef.current.display(
                                                        nextTocItem.href,
                                                    );
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
