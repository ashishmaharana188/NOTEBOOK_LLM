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
    ReaderAnnotation,
    ReaderBook,
    ReaderSearchResult,
    TocItem,
} from "../../types/readerBackendTypes";
import {
    annotationHasAttachedNote,
    type ReaderNoteMarker,
    type ReaderSurfaceCommonProps,
    type ReaderSurfaceHandle,
    type ReaderSelectionPayload,
    type ReaderTapZone,
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

function getDomRectPayload(rect: DOMRect | null | undefined) {
    if (!rect) return null;
    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

export default forwardRef<ReaderSurfaceHandle, PlayBooksEpubSurfaceProps>(
    function PlayBooksEpubSurface(
        {
            book,
            initialLocation,
            onSaveLocation,
            onStateChange,
            onSelection,
            annotations = [],
            onAnnotationPress,
            onVisibleNoteMarkersChange,
            onInteractionStateChange,
            onContextMenuRequest,
            onTapZoneRequest,
            onOpenContents,
            settings,
            presentationMode,
            platformLayout,
            showFocusPreview = false,
        },
        ref,
    ) {
        const readerRef = useRef<any>(null);
        const renditionRef = useRef<any>(null);
        const containerRef = useRef<HTMLDivElement | null>(null);
        const viewportRef = useRef<HTMLDivElement | null>(null);
        const lastViewportSizeRef = useRef({ width: 0, height: 0 });
        const lastKnownLocationRef = useRef<string | number | null>(
            initialLocation,
        );
        const onSelectionRef = useRef(onSelection);
        const onContextMenuRequestRef = useRef(onContextMenuRequest);
        const onTapZoneRequestRef = useRef(onTapZoneRequest);
        const onAnnotationPressRef = useRef(onAnnotationPress);
        const onVisibleNoteMarkersChangeRef = useRef(
            onVisibleNoteMarkersChange,
        );
        const appliedHighlightCfisRef = useRef<string[]>([]);
        const lastSelectedCfiRef = useRef("");
        const boundContextDocsRef = useRef(new WeakSet<Document>());
        const boundSelectionDocsRef = useRef(new WeakSet<Document>());
        const boundMobileTapDocsRef = useRef(new WeakSet<Document>());
        const boundScrollTargetsRef = useRef(new WeakSet<EventTarget>());
        const selectionFinalizeTimeoutRef = useRef<number | null>(null);
        const selectionInProgressRef = useRef(false);
        const suppressSelectionEventsRef = useRef(false);
        const pendingTouchSelectionRef = useRef<
            Omit<ReaderSelectionPayload, "phase" | "source" | "kind"> | null
        >(null);
        const [location, setLocation] = useState<string | number | null>(
            initialLocation,
        );
        const [toc, setToc] = useState<TocItem[]>([]);
        const [currentPage, setCurrentPage] = useState(1);
        const [totalPages, setTotalPages] = useState(1);
        const [chapterLabel, setChapterLabel] = useState(book.title);
        const [currentHref, setCurrentHref] = useState("");
        const [visibleText, setVisibleText] = useState("");
        const [viewportSize, setViewportSize] = useState({
            width: 0,
            height: 0,
        });
        const [selectionInProgress, setSelectionInProgress] = useState(false);
        const [tempHighlightReady, setTempHighlightReady] = useState(false);
        const pagedMode = presentationMode === "paged";
        const desktopLayout = platformLayout === "desktop";
        const desktopSectionPaging = false;
        const desktopFocusPreview = false;
        const mobileScrollMode = !desktopLayout && !pagedMode;

        useEffect(() => {
            selectionInProgressRef.current = selectionInProgress;
        }, [selectionInProgress]);

        useEffect(() => {
            lastKnownLocationRef.current = location;
        }, [location]);

        useEffect(() => {
            onSelectionRef.current = onSelection;
        }, [onSelection]);

        useEffect(() => {
            onContextMenuRequestRef.current = onContextMenuRequest;
        }, [onContextMenuRequest]);

        useEffect(() => {
            onTapZoneRequestRef.current = onTapZoneRequest;
        }, [onTapZoneRequest]);

        useEffect(() => {
            onAnnotationPressRef.current = onAnnotationPress;
        }, [onAnnotationPress]);

        useEffect(() => {
            onVisibleNoteMarkersChangeRef.current = onVisibleNoteMarkersChange;
        }, [onVisibleNoteMarkersChange]);

        useEffect(() => {
            onInteractionStateChange?.({
                lockNavigation: false,
                scale: 1,
                selectionInProgress,
                tempHighlightReady,
            });
        }, [onInteractionStateChange, selectionInProgress, tempHighlightReady]);

        useEffect(() => {
            return () => {
                if (selectionFinalizeTimeoutRef.current) {
                    window.clearTimeout(selectionFinalizeTimeoutRef.current);
                }
            };
        }, []);

        const clearPendingSelectionFinalize = useCallback(() => {
            if (!selectionFinalizeTimeoutRef.current) return;
            window.clearTimeout(selectionFinalizeTimeoutRef.current);
            selectionFinalizeTimeoutRef.current = null;
        }, []);

        const emitSelectionPayload = useCallback(
            (
                payload: Omit<
                    ReaderSelectionPayload,
                    "phase" | "source" | "kind"
                > | null,
                phase: ReaderSelectionPayload["phase"],
                source: ReaderSelectionPayload["source"],
                kind: ReaderSelectionPayload["kind"],
            ) => {
                onSelectionRef.current?.(
                    payload
                        ? {
                              ...payload,
                              kind,
                              phase,
                              source,
                          }
                        : {
                              text: "",
                              rect: null,
                              kind,
                              phase,
                              source,
                          },
                );
            },
            [],
        );

        const getRenderedContents = useCallback(() => {
            return renditionRef.current?.getContents?.() || [];
        }, []);

        const getMatchedTocState = useCallback(
            (href: string) => {
                const normalizedHref = String(href || "");
                const tocIndex = toc.findIndex(
                    (item) =>
                        item.href &&
                        normalizedHref &&
                        normalizedHref.startsWith(item.href.replace(/#.*$/, "")),
                );
                return {
                    tocIndex,
                    item:
                        (tocIndex >= 0 ? toc[tocIndex] : null) ||
                        toc.find((entry) => entry.href === normalizedHref) ||
                        null,
                };
            },
            [toc],
        );

        const getContentHref = useCallback((content: any) => {
            const hrefCandidates = [
                content?.section?.href,
                content?.href,
                content?.document?.documentElement?.getAttribute?.("data-href"),
                content?.document?.body?.getAttribute?.("data-href"),
            ];
            for (const candidate of hrefCandidates) {
                if (typeof candidate === "string" && candidate.trim()) {
                    return String(candidate);
                }
            }
            return "";
        }, []);

        const getVisibleContentState = useCallback(() => {
            const contents = getRenderedContents();
            if (!contents.length) return null;
            const ownerRect = viewportRef.current?.getBoundingClientRect();
            if (!ownerRect) {
                const fallbackContent = contents[0] || null;
                const fallbackHref =
                    getContentHref(fallbackContent) ||
                    String(
                        renditionRef.current?.currentLocation?.()?.start?.href ||
                            currentHref ||
                            "",
                    );
                const fallbackToc = getMatchedTocState(fallbackHref);
                return {
                    content: fallbackContent,
                    href: fallbackHref,
                    tocIndex: fallbackToc.tocIndex,
                    tocItem: fallbackToc.item,
                };
            }

            let bestContent: any = contents[0] || null;
            let bestScore = Number.POSITIVE_INFINITY;

            contents.forEach((content: any) => {
                const frameElement = content?.window?.frameElement as
                    | HTMLElement
                    | null;
                const rect = frameElement?.getBoundingClientRect?.();
                if (!rect) return;
                const intersectsTop =
                    rect.top <= ownerRect.top && rect.bottom > ownerRect.top;
                const intersectsViewport =
                    rect.bottom > ownerRect.top && rect.top < ownerRect.bottom;
                const distance = Math.abs(rect.top - ownerRect.top);
                const score = intersectsTop
                    ? distance
                    : intersectsViewport
                      ? 1000 + distance
                      : 2000 + distance;
                if (score < bestScore) {
                    bestContent = content;
                    bestScore = score;
                }
            });

            const href =
                getContentHref(bestContent) ||
                String(
                    renditionRef.current?.currentLocation?.()?.start?.href ||
                        currentHref ||
                        "",
                );
            const matchedToc = getMatchedTocState(href);
            return {
                content: bestContent,
                href,
                tocIndex: matchedToc.tocIndex,
                tocItem: matchedToc.item,
            };
        }, [
            currentHref,
            getContentHref,
            getMatchedTocState,
            getRenderedContents,
        ]);

        const getActiveContents = useCallback(() => {
            return getVisibleContentState()?.content || getRenderedContents()[0] || null;
        }, [getRenderedContents, getVisibleContentState]);

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
            if (mobileScrollMode) {
                const visibleContentState = getVisibleContentState();
                return {
                    tocIndex: visibleContentState?.tocIndex ?? -1,
                    prevItem:
                        visibleContentState &&
                        visibleContentState.tocIndex > 0 &&
                        visibleContentState.tocIndex < toc.length
                            ? toc[visibleContentState.tocIndex - 1]
                            : null,
                    nextItem:
                        visibleContentState &&
                        visibleContentState.tocIndex >= 0 &&
                        visibleContentState.tocIndex < toc.length - 1
                            ? toc[visibleContentState.tocIndex + 1]
                            : null,
                };
            }
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
        }, [currentHref, getVisibleContentState, mobileScrollMode, toc]);

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
                const overflowMode = desktopSectionPaging || mobileScrollMode
                    ? "auto"
                    : pagedMode
                      ? "hidden"
                      : "visible";
                const pagedInlineInset = desktopLayout ? 10 : 8;
                const pagedTopInset = desktopLayout ? 6 : 8;
                const pagedBottomInset = desktopLayout ? 12 : 14;
                const desktopPagedBodyMaxWidth = "600px";
                const scrollBodyMaxWidth = desktopLayout ? "760px" : "none";
                const scrollBodyPadding = desktopLayout
                    ? "28px 0 112px"
                    : "0 10px 72px";

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
            touch-action: ${mobileScrollMode ? "auto" : "manipulation"} !important;
            -webkit-text-size-adjust: 100% !important;
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
            -webkit-user-select: text !important;
            user-select: text !important;
            -webkit-touch-callout: default !important;
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
                mobileScrollMode,
                pagedMode,
                settings.alignment,
                settings.fontFamily,
                settings.fontSize,
                settings.lineHeight,
                settings.theme,
            ],
        );

        const syncVisibleText = useCallback(() => {
            const activeContent = getActiveContents();
            const contents = activeContent ? [activeContent] : getRenderedContents();
            const text = contents
                .map((content: any) =>
                    String(content?.document?.body?.innerText || "").trim(),
                )
                .filter(Boolean)
                .join("\n\n")
                .trim();
            setVisibleText(text);
            return text;
        }, [getActiveContents, getRenderedContents]);

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
                    location:
                        locationValue || lastKnownLocationRef.current || "",
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
                const cfi = String(
                    loc?.start?.cfi || lastKnownLocationRef.current || "",
                );
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
                if (mobileScrollMode) {
                    const metrics = getScrollMetrics();
                    const nextVisibleText = syncVisibleText();
                    const sectionPage = metrics?.currentVirtualPage || 1;
                    const sectionTotal = Math.max(
                        metrics?.totalVirtualPages || 1,
                        1,
                    );
                    const locationPayload = {
                        location: cfi,
                        locationType: "epub_cfi",
                        progressPercent: safePercentage * 100,
                        pageLabel:
                            matchedChapter?.label || chapterLabel || book.title,
                        viewState: {
                            page: sectionPage,
                            total: sectionTotal,
                            displayedPage: displayedPage || 1,
                            displayedTotal: displayedTotal || 1,
                            sectionScrollTop: metrics?.scrollTop || 0,
                            flow: "scrolled-doc",
                        },
                    };
                    setCurrentPage(sectionPage);
                    setTotalPages(sectionTotal);
                    setChapterLabel(
                        matchedChapter?.label || chapterLabel || book.title,
                    );
                    onStateChange({
                        currentPage: sectionPage,
                        totalPages: sectionTotal,
                        pageLabel: `Page ${sectionPage}`,
                        chapterLabel:
                            matchedChapter?.label || chapterLabel || book.title,
                        progressPercent: safePercentage * 100,
                        pagesLeftLabel: `${Math.max(sectionTotal - sectionPage, 0)} pages left in chapter`,
                        visibleText: nextVisibleText,
                        locationPayload,
                    });
                    onSaveLocation(locationPayload);
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
                getScrollMetrics,
                location,
                mobileScrollMode,
                onSaveLocation,
                onStateChange,
                pagedMode,
                syncScrollPagingState,
                syncVisibleText,
                toc,
            ],
        );

        const resizeViewportRendition = useCallback(() => {
            const viewport = viewportRef.current;
            const rendition = renditionRef.current;
            if (!viewport || !rendition?.resize) return false;
            const rect = viewport.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const nextWidth = Math.floor(rect.width);
            const nextHeight = Math.floor(rect.height);
            const prevSize = lastViewportSizeRef.current;
            const sizeChanged =
                prevSize.width !== nextWidth || prevSize.height !== nextHeight;

            if (!sizeChanged) {
                return true;
            }

            lastViewportSizeRef.current = {
                width: nextWidth,
                height: nextHeight,
            };
            setViewportSize({
                width: nextWidth,
                height: nextHeight,
            });
            rendition.resize(nextWidth, nextHeight);
            return true;
        }, []);

        const configureRendition = useCallback(
            (rendition: any) => {
                renditionRef.current = rendition;
                window.requestAnimationFrame(() => {
                    resizeViewportRendition();
                });
                rendition.hooks.content.register((contents: any) => {
                    applyThemeToContents(contents);
                    const doc = contents?.document;
                    const getIframeSelectionPayload = () => {
                        if (!doc) return null;
                        const selection = doc.getSelection?.();
                        const text = String(
                            selection?.toString?.() || "",
                        ).trim();
                        if (!text || !selection || selection.rangeCount === 0) {
                            return null;
                        }
                        const range = selection.getRangeAt(0);
                        const localRect = range.getBoundingClientRect();
                        const fallbackRect = range.getClientRects().item(0);
                        const resolvedRect =
                            localRect.width > 0 || localRect.height > 0
                                ? localRect
                                : fallbackRect;
                        const frameElement = contents?.window?.frameElement as
                            | HTMLElement
                            | null;
                        const iframeRect = frameElement?.getBoundingClientRect();
                        return {
                            text,
                            rect:
                                resolvedRect && iframeRect
                                    ? {
                                          left: iframeRect.left + resolvedRect.left,
                                          top: iframeRect.top + resolvedRect.top,
                                          right: iframeRect.left + resolvedRect.right,
                                          bottom: iframeRect.top + resolvedRect.bottom,
                                          width: resolvedRect.width,
                                          height: resolvedRect.height,
                                      }
                                    : null,
                            ...(lastSelectedCfiRef.current
                                ? {
                                      anchor: {
                                          cfi_range: lastSelectedCfiRef.current,
                                          href: String(
                                              renditionRef.current?.currentLocation?.()?.start
                                                  ?.href || "",
                                          ),
                                      },
                                  }
                                : {}),
                        };
                    };
                    const clearIframeSelection = (
                        source: ReaderSelectionPayload["source"] = desktopLayout
                            ? "mouse"
                            : "touch",
                        phase: ReaderSelectionPayload["phase"] = desktopLayout
                            ? "final"
                            : "draft",
                    ) => {
                        lastSelectedCfiRef.current = "";
                        clearPendingSelectionFinalize();
                        pendingTouchSelectionRef.current = null;
                        setSelectionInProgress(false);
                        setTempHighlightReady(false);
                        emitSelectionPayload(null, phase, source, "selection");
                    };
                    const finalizeIframeSelection = (
                        source: ReaderSelectionPayload["source"] = desktopLayout
                            ? "mouse"
                            : "touch",
                    ) => {
                        if (!doc) return;
                        const selectionPayload = getIframeSelectionPayload();
                        if (source === "mouse" || desktopLayout) {
                            setSelectionInProgress(false);
                            setTempHighlightReady(false);
                            emitSelectionPayload(
                                selectionPayload,
                                "final",
                                "mouse",
                                "selection",
                            );
                            return;
                        }
                        if (!selectionPayload) {
                            clearIframeSelection("touch", "final");
                            return;
                        }
                        clearPendingSelectionFinalize();
                        selectionFinalizeTimeoutRef.current =
                            window.setTimeout(() => {
                                const settledPayload = getIframeSelectionPayload();
                                const hasValidRect = Boolean(
                                    settledPayload?.rect &&
                                        ((settledPayload.rect.width || 0) > 0 ||
                                            (settledPayload.rect.height || 0) >
                                                0),
                                );
                                const hasMinText =
                                    String(
                                        settledPayload?.text || "",
                                    ).trim().length >= 2;
                                setSelectionInProgress(false);
                                selectionFinalizeTimeoutRef.current = null;
                                if (
                                    !settledPayload ||
                                    !hasValidRect ||
                                    !hasMinText
                                ) {
                                    pendingTouchSelectionRef.current = null;
                                    setTempHighlightReady(false);
                                    emitSelectionPayload(
                                        null,
                                        "final",
                                        "touch",
                                        "selection",
                                    );
                                    return;
                                }
                                pendingTouchSelectionRef.current = settledPayload;
                                setTempHighlightReady(false);
                            }, 180);
                    };
                    if (
                        platformLayout === "desktop" &&
                        doc &&
                        !boundContextDocsRef.current.has(doc)
                    ) {
                        const handleContextMenu = (event: MouseEvent) => {
                            event.preventDefault();
                            onContextMenuRequestRef.current?.();
                        };
                        boundContextDocsRef.current.add(doc);
                        doc.addEventListener("contextmenu", handleContextMenu);
                    }
                    if (doc && !boundSelectionDocsRef.current.has(doc)) {
                        boundSelectionDocsRef.current.add(doc);
                        doc.addEventListener("selectionchange", () => {
                            if (suppressSelectionEventsRef.current) {
                                suppressSelectionEventsRef.current = false;
                                return;
                            }
                            const selectionPayload = getIframeSelectionPayload();
                            if (desktopLayout) {
                                if (!selectionPayload) {
                                    clearIframeSelection("mouse", "final");
                                }
                                return;
                            }
                            clearPendingSelectionFinalize();
                            if (!selectionPayload) {
                                if (pendingTouchSelectionRef.current) {
                                    const pendingSelection =
                                        pendingTouchSelectionRef.current;
                                    pendingTouchSelectionRef.current = null;
                                    setSelectionInProgress(false);
                                    setTempHighlightReady(true);
                                    emitSelectionPayload(
                                        pendingSelection,
                                        "final",
                                        "touch",
                                        "temp-highlight",
                                    );
                                    return;
                                }
                                clearIframeSelection("touch", "draft");
                                return;
                            }
                            pendingTouchSelectionRef.current = null;
                            setSelectionInProgress(true);
                            setTempHighlightReady(false);
                            emitSelectionPayload(
                                selectionPayload,
                                "draft",
                                "touch",
                                "selection",
                            );
                        });
                        doc.addEventListener("mouseup", () =>
                            finalizeIframeSelection("mouse"),
                        );
                        doc.addEventListener("touchend", () =>
                            finalizeIframeSelection("touch"),
                        );
                    }
                    if (
                        !desktopLayout &&
                        doc &&
                        !boundMobileTapDocsRef.current.has(doc)
                    ) {
                        boundMobileTapDocsRef.current.add(doc);
                        let touchState:
                            | {
                                  x: number;
                                  y: number;
                                  time: number;
                                  moved: boolean;
                              }
                            | null = null;
                        const resolveTapZone = (
                            clientX: number,
                        ): ReaderTapZone => {
                            const frameElement = contents?.window
                                ?.frameElement as HTMLElement | null;
                            const frameRect =
                                frameElement?.getBoundingClientRect();
                            if (!frameRect) {
                                return "center";
                            }
                            const localX = clientX - frameRect.left;
                            const edgeWidth = Math.min(
                                120,
                                Math.max(72, frameRect.width * 0.22),
                            );
                            if (localX <= edgeWidth) {
                                return "left";
                            }
                            if (localX >= frameRect.width - edgeWidth) {
                                return "right";
                            }
                            return "center";
                        };
                        const handleTouchStart = (event: TouchEvent) => {
                            const touch = event.touches[0];
                            if (!touch) return;
                            clearPendingSelectionFinalize();
                            touchState = {
                                x: touch.clientX,
                                y: touch.clientY,
                                time: Date.now(),
                                moved: false,
                            };
                        };
                        const handleTouchMove = (event: TouchEvent) => {
                            const touch = event.touches[0];
                            if (!touchState || !touch) return;
                            if (
                                Math.abs(touch.clientX - touchState.x) > 10 ||
                                Math.abs(touch.clientY - touchState.y) > 10
                            ) {
                                touchState.moved = true;
                            }
                        };
                        const handleTouchEnd = (event: TouchEvent) => {
                            const previousTouch = touchState;
                            touchState = null;
                            const touch = event.changedTouches[0];
                            if (!previousTouch || !touch) return;
                            const target = event.target as HTMLElement | null;
                            if (
                                target?.closest(
                                    "a, button, input, textarea, select, [contenteditable='true']",
                                )
                            ) {
                                return;
                            }
                            const selectedText = String(
                                doc.getSelection?.()?.toString?.() || "",
                            ).trim();
                            if (
                                selectedText ||
                                selectionInProgressRef.current
                            ) {
                                return;
                            }
                            const deltaX = touch.clientX - previousTouch.x;
                            const deltaY = touch.clientY - previousTouch.y;
                            if (
                                Math.abs(deltaX) > 60 &&
                                Math.abs(deltaX) > Math.abs(deltaY)
                            ) {
                                onTapZoneRequestRef.current?.(
                                    deltaX < 0 ? "right" : "left",
                                );
                                return;
                            }
                            const isTap =
                                !previousTouch.moved &&
                                Math.abs(deltaX) < 10 &&
                                Math.abs(deltaY) < 10 &&
                                Date.now() - previousTouch.time < 320;
                            if (!isTap) return;
                            onTapZoneRequestRef.current?.(
                                resolveTapZone(touch.clientX),
                            );
                        };
                        doc.addEventListener("touchstart", handleTouchStart, {
                            passive: true,
                        });
                        doc.addEventListener("touchmove", handleTouchMove, {
                            passive: true,
                        });
                        doc.addEventListener("touchend", handleTouchEnd, {
                            passive: true,
                        });
                    }
                    if (desktopSectionPaging || !pagedMode) {
                        const scrollingElement =
                            doc?.scrollingElement ||
                            doc?.documentElement ||
                            doc?.body ||
                            null;
                        const win = contents?.window;
                        if (
                            scrollingElement &&
                            win?.requestAnimationFrame &&
                            !boundScrollTargetsRef.current.has(scrollingElement)
                        ) {
                            let ticking = false;
                            const handleScroll = () => {
                                if (ticking) return;
                                ticking = true;
                                win.requestAnimationFrame(() => {
                                    ticking = false;
                                    const currentLocation =
                                        rendition.currentLocation?.();
                                    if (mobileScrollMode) {
                                        if (currentLocation) {
                                            syncRelocation(currentLocation);
                                        }
                                        return;
                                    }
                                    if (desktopSectionPaging) {
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
                                            currentLocation?.start?.cfi ||
                                                lastKnownLocationRef.current,
                                        );
                                        return;
                                    }
                                    if (currentLocation) {
                                        syncRelocation(currentLocation);
                                    }
                                });
                            };
                            boundScrollTargetsRef.current.add(scrollingElement);
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
                    lastSelectedCfiRef.current = cfiRange;
                    if (onSelectionRef.current && desktopLayout) {
                        const localRect = range?.getBoundingClientRect?.();
                        const fallbackRect = range?.getClientRects?.()?.item?.(0);
                        const resolvedRect =
                            localRect && (localRect.width > 0 || localRect.height > 0)
                                ? localRect
                                : fallbackRect;
                        const activeContents = rendition.getContents?.()?.[0];
                        const frameElement = activeContents?.window?.frameElement as
                            | HTMLElement
                            | null;
                        const iframeRect = frameElement?.getBoundingClientRect();
                        onSelectionRef.current({
                            text,
                            rect:
                                text && resolvedRect && iframeRect
                                    ? {
                                          left: iframeRect.left + resolvedRect.left,
                                          top: iframeRect.top + resolvedRect.top,
                                          right: iframeRect.left + resolvedRect.right,
                                          bottom: iframeRect.top + resolvedRect.bottom,
                                          width: resolvedRect.width,
                                          height: resolvedRect.height,
                                      }
                                    : null,
                            anchor: {
                                cfi_range: cfiRange,
                                href: String(
                                    rendition.currentLocation?.()?.start?.href ||
                                        "",
                                ),
                            },
                            kind: "selection",
                            phase: "final",
                            source: "mouse",
                        });
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
                pagedMode,
                platformLayout,
                resizeViewportRendition,
                syncRelocation,
                syncScrollPagingState,
                toc,
            ],
        );

        useLayoutEffect(() => {
            const viewport = viewportRef.current;
            if (!viewport) return;

            const resize = () => {
                resizeViewportRendition();
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
            resizeViewportRendition,
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

        useEffect(() => {
            const rendition = renditionRef.current;
            if (!rendition?.annotations) return;
            const activeHighlights = annotations.filter(
                (annotation) =>
                    annotation.kind !== "bookmark" &&
                    typeof annotation.anchor?.cfi_range === "string" &&
                    annotation.anchor.cfi_range,
            );
            appliedHighlightCfisRef.current.forEach((cfiRange) => {
                if (
                    !activeHighlights.some(
                        (annotation) =>
                            String(annotation.anchor?.cfi_range || "") === cfiRange,
                    )
                ) {
                    try {
                        rendition.annotations.remove(cfiRange, "highlight");
                    } catch {
                        // Ignore missing highlight removal.
                    }
                }
            });

            activeHighlights.forEach((annotation) => {
                const cfiRange = String(annotation.anchor?.cfi_range || "");
                try {
                    rendition.annotations.remove(cfiRange, "highlight");
                } catch {
                    // Ignore missing highlight removal.
                }
                rendition.annotations.highlight(
                    cfiRange,
                    { annotationId: annotation.annotation_id },
                    (event: MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAnnotationPressRef.current?.(
                            annotation,
                            getDomRectPayload(
                                (event.target as HTMLElement | null)?.getBoundingClientRect?.(),
                            ),
                        );
                    },
                    "reader-epub-highlight",
                    {
                        fill:
                            annotation.color === "orange"
                                ? "rgba(255,116,72,0.28)"
                                : annotation.color === "green"
                                  ? "rgba(138,198,80,0.28)"
                                  : annotation.color === "blue"
                                    ? "rgba(55,197,221,0.28)"
                                    : "rgba(247,201,72,0.38)",
                        "fill-opacity": "1",
                        "mix-blend-mode": "multiply",
                    },
                );
            });
            appliedHighlightCfisRef.current = activeHighlights.map((annotation) =>
                String(annotation.anchor?.cfi_range || ""),
            );
        }, [annotations, currentHref]);

        useEffect(() => {
            const emitVisibleNoteMarkers = () => {
                const onChange = onVisibleNoteMarkersChangeRef.current;
                const rendition = renditionRef.current;
                const activeContents = getActiveContents();
                const frameElement = activeContents?.window?.frameElement as
                    | HTMLElement
                    | null;
                const iframeRect = frameElement?.getBoundingClientRect();

                if (!onChange || !rendition || !iframeRect) {
                    onChange?.([]);
                    return;
                }

                const nextMarkers: ReaderNoteMarker[] = [];
                const seen = new Set<string>();
                const baseCurrentHref = String(currentHref || "").replace(
                    /#.*$/,
                    "",
                );

                annotations.forEach((annotation) => {
                    if (
                        seen.has(annotation.annotation_id) ||
                        !annotationHasAttachedNote(annotation)
                    ) {
                        return;
                    }
                    const cfiRange = String(annotation.anchor?.cfi_range || "");
                    if (!cfiRange) return;
                    const anchorHref = String(annotation.anchor?.href || "").replace(
                        /#.*$/,
                        "",
                    );
                    if (
                        anchorHref &&
                        baseCurrentHref &&
                        anchorHref !== baseCurrentHref
                    ) {
                        return;
                    }
                    const range = rendition.getRange?.(cfiRange);
                    const localRect =
                        range?.getBoundingClientRect?.() ||
                        range?.getClientRects?.()?.item?.(0) ||
                        null;
                    if (
                        !localRect ||
                        (localRect.width <= 0 && localRect.height <= 0)
                    ) {
                        return;
                    }
                    seen.add(annotation.annotation_id);
                    nextMarkers.push({
                        annotation,
                        rect: {
                            left: iframeRect.left + localRect.left,
                            top: iframeRect.top + localRect.top,
                            right: iframeRect.left + localRect.right,
                            bottom: iframeRect.top + localRect.bottom,
                            width: localRect.width,
                            height: localRect.height,
                        },
                    });
                });

                onChange(nextMarkers);
            };

            const frame = window.requestAnimationFrame(emitVisibleNoteMarkers);
            const activeContents = getActiveContents();
            const doc = activeContents?.document;
            const scrollingElement =
                doc?.scrollingElement || doc?.documentElement || doc?.body || null;
            const handleSync = () => {
                window.requestAnimationFrame(emitVisibleNoteMarkers);
            };

            scrollingElement?.addEventListener("scroll", handleSync, {
                passive: true,
            });
            window.addEventListener("resize", handleSync);

            return () => {
                window.cancelAnimationFrame(frame);
                scrollingElement?.removeEventListener("scroll", handleSync);
                window.removeEventListener("resize", handleSync);
                onVisibleNoteMarkersChangeRef.current?.([]);
            };
        }, [
            annotations,
            currentHref,
            currentPage,
            getActiveContents,
            totalPages,
            viewportSize,
        ]);

        const syncMobileScrollState = useCallback(() => {
            if (!mobileScrollMode) return;
            const metrics = getScrollMetrics();
            if (!metrics) return;
            const visibleContentState = getVisibleContentState();
            const activeHref = String(
                visibleContentState?.href ||
                    renditionRef.current?.currentLocation?.()?.start?.href ||
                    currentHref ||
                    "",
            );
            const matchedToc =
                visibleContentState?.tocItem || getMatchedTocState(activeHref).item;
            const matchedIndex =
                visibleContentState?.tocIndex ?? getMatchedTocState(activeHref).tocIndex;
            const matchedLabel =
                matchedToc?.label || chapterLabel || book.title;
            const progressWithinView =
                metrics.totalVirtualPages <= 1
                    ? 0
                    : (metrics.currentVirtualPage - 1) /
                      Math.max(metrics.totalVirtualPages - 1, 1);
            const overallProgress =
                matchedIndex >= 0 && toc.length > 0
                    ? (Math.max(0, matchedIndex) + progressWithinView) /
                      Math.max(toc.length - 1, 1)
                    : progressWithinView;
            const nextVisibleText = syncVisibleText();
            const currentLocation = renditionRef.current?.currentLocation?.();
            const cfi = String(
                currentLocation?.start?.cfi ||
                    lastKnownLocationRef.current ||
                    activeHref ||
                    "",
            );
            const locationPayload = {
                location: cfi,
                locationType: "epub_cfi",
                progressPercent:
                    Math.max(0, Math.min(overallProgress, 1)) * 100,
                pageLabel: matchedLabel,
                viewState: {
                    page: metrics.currentVirtualPage,
                    total: metrics.totalVirtualPages,
                    displayedPage: metrics.currentVirtualPage,
                    displayedTotal: metrics.totalVirtualPages,
                    sectionScrollTop: metrics.scrollTop,
                    flow: "scrolled",
                },
            };
            setCurrentHref(activeHref);
            setCurrentPage(metrics.currentVirtualPage);
            setTotalPages(metrics.totalVirtualPages);
            setChapterLabel(matchedLabel);
            onStateChange({
                currentPage: metrics.currentVirtualPage,
                totalPages: metrics.totalVirtualPages,
                pageLabel: `Page ${metrics.currentVirtualPage}`,
                chapterLabel: matchedLabel,
                progressPercent: locationPayload.progressPercent,
                pagesLeftLabel: `${Math.max(metrics.totalVirtualPages - metrics.currentVirtualPage, 0)} pages left in view`,
                visibleText: nextVisibleText,
                locationPayload,
            });
            onSaveLocation(locationPayload);
        }, [
            book.title,
            chapterLabel,
            currentHref,
            getMatchedTocState,
            getScrollMetrics,
            getVisibleContentState,
            location,
            mobileScrollMode,
            onSaveLocation,
            onStateChange,
            syncVisibleText,
            toc.length,
        ]);

        const currentTocIndex = getCurrentTocState().tocIndex;
        const nextTocItem =
            currentTocIndex >= 0 && currentTocIndex < toc.length - 1
                ? toc[currentTocIndex + 1]
                : null;
        const prevTocItem =
            currentTocIndex > 0 ? toc[currentTocIndex - 1] : null;
        const syncDisplayedRelocation = useCallback(() => {
            if (mobileScrollMode) {
                syncMobileScrollState();
                return;
            }
            const nextLocation = renditionRef.current?.currentLocation?.();
            if (nextLocation) {
                syncRelocation(nextLocation);
            }
        }, [mobileScrollMode, syncMobileScrollState, syncRelocation]);
        const stepSpineNavigation = useCallback(
            (direction: "prev" | "next") => {
                const rendition = renditionRef.current;
                if (!rendition) return false;
                const tocTarget =
                    direction === "next"
                        ? getCurrentTocState().nextItem
                        : getCurrentTocState().prevItem;
                if (tocTarget?.href) {
                    void rendition.display(tocTarget.href).then(() => {
                        window.requestAnimationFrame(() => {
                            syncDisplayedRelocation();
                        });
                    });
                    return true;
                }
                const step =
                    direction === "next"
                        ? rendition.next?.bind(rendition)
                        : rendition.prev?.bind(rendition);
                if (!step) return false;
                void Promise.resolve(step()).then(() => {
                    window.requestAnimationFrame(() => {
                        syncDisplayedRelocation();
                    });
                });
                return true;
            },
            [getCurrentTocState, syncDisplayedRelocation],
        );
        const stepScrollPage = useCallback(
            (direction: "prev" | "next") => {
                const metrics = getScrollMetrics();
                if (!metrics) return false;
                const maxScrollTop = Math.max(
                    0,
                    metrics.scrollHeight - metrics.clientHeight,
                );
                const targetTop =
                    direction === "next"
                        ? Math.min(
                              maxScrollTop,
                              metrics.scrollTop + metrics.clientHeight,
                          )
                        : Math.max(0, metrics.scrollTop - metrics.clientHeight);
                if (Math.abs(targetTop - metrics.scrollTop) > 2) {
                    metrics.scrollingElement.scrollTo({
                        top: targetTop,
                        behavior: "smooth",
                    });
                    return true;
                }
                const tocTarget =
                    direction === "next" ? nextTocItem : prevTocItem;
                if (tocTarget?.href && renditionRef.current) {
                    void renditionRef.current
                        .display(tocTarget.href)
                        .then(() => {
                            window.requestAnimationFrame(() => {
                                syncDisplayedRelocation();
                            });
                        });
                    return true;
                }
                return false;
            },
            [
                getScrollMetrics,
                nextTocItem,
                prevTocItem,
                syncDisplayedRelocation,
            ],
        );

        useImperativeHandle(
            ref,
            () => ({
                prev: () => {
                    if (mobileScrollMode && stepSpineNavigation("prev")) {
                        return;
                    }
                    if ((!pagedMode || !desktopLayout) && stepScrollPage("prev")) {
                        return;
                    }
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
                    if (mobileScrollMode && stepSpineNavigation("next")) {
                        return;
                    }
                    if ((!pagedMode || !desktopLayout) && stepScrollPage("next")) {
                        return;
                    }
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
                    if (!pagedMode) {
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
                        if (mobileScrollMode) {
                            window.requestAnimationFrame(() => {
                                syncDisplayedRelocation();
                            });
                        }
                    }
                },
                goToTocTarget: async (target) => {
                    if (target.href && renditionRef.current) {
                        await renditionRef.current.display(target.href);
                        if (mobileScrollMode) {
                            window.requestAnimationFrame(() => {
                                syncDisplayedRelocation();
                            });
                        }
                    }
                },
                clearSelection: (options) => {
                    suppressSelectionEventsRef.current = true;
                    pendingTouchSelectionRef.current = null;
                    setSelectionInProgress(false);
                    if (!options?.preserveTemporary) {
                        setTempHighlightReady(false);
                    }
                    window.getSelection()?.removeAllRanges();
                    const contents = renditionRef.current?.getContents?.() || [];
                    contents.forEach((content: any) => {
                        content?.document?.getSelection?.()?.removeAllRanges?.();
                    });
                },
            }),
            [
                desktopLayout,
                desktopSectionPaging,
                getCurrentTocState,
                getScrollMetrics,
                mobileScrollMode,
                pagedMode,
                stepSpineNavigation,
                stepScrollPage,
                syncDisplayedRelocation,
                totalPages,
            ],
        );

        const epubOptions = useMemo(
            () =>
                ({
                    flow: desktopSectionPaging || mobileScrollMode
                        ? "scrolled-doc"
                        : pagedMode
                          ? "paginated"
                          : "scrolled",
                    manager: desktopSectionPaging || mobileScrollMode
                        ? "default"
                        : pagedMode
                          ? "default"
                          : "continuous",
                    spread: "none",
                    width: "100%",
                    height: "100%",
                    allowPopups: true,
                }) as any,
            [desktopSectionPaging, mobileScrollMode, pagedMode],
        );
        const showMobilePagedShell = pagedMode && !desktopLayout;
        const paperBackground =
            settings.theme === "dark"
                ? "#050505"
                : settings.theme === "sepia"
                  ? "#f8f0df"
                  : "#ffffff";
        const viewportPadding = pagedMode
            ? desktopLayout
                ? desktopFocusPreview
                    ? "18px 0 22px"
                    : "0 0 8px"
                : "10px 10px 18px"
            : desktopLayout
              ? "24px 0 96px"
              : "0 10px 84px";
        const viewportMaxWidth = pagedMode
            ? showMobilePagedShell
                ? undefined
                : "100%"
            : desktopLayout
              ? "840px"
              : "100%";
        const renderDesktopPeekShell = (side: "left" | "right") => {
            const visibleWidth = 136;
            const cardWidth = 520;
            const revealDepth = 82;
            const hiddenOffset = cardWidth - visibleWidth - revealDepth;
            const previewSeed = visibleText.trim() || chapterLabel || book.title;
            const previewText =
                side === "left"
                    ? previewSeed.slice(0, 2400)
                    : previewSeed.slice(640, 3040) || previewSeed.slice(0, 2400);
            const previewParagraphs = previewText
                .split(/\n{2,}|(?<=[.!?])\s+/)
                .map((chunk) => chunk.replace(/\s+/g, " ").trim())
                .filter(Boolean)
                .slice(0, 12);

            return (
                <div
                    className="hidden overflow-hidden md:block"
                    style={{
                        width: `${visibleWidth}px`,
                        height: "88%",
                        maxHeight: "940px",
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            position: "relative",
                            width: `${cardWidth}px`,
                            height: "100%",
                            borderRadius: "18px",
                            background: paperBackground,
                            boxShadow: "0 18px 42px rgba(15,23,42,0.10)",
                            overflow: "hidden",
                            transform: `translateX(${side === "left" ? -hiddenOffset : 0}px)`,
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                background: paperBackground,
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                top: "26px",
                                left: "28px",
                                right: "28px",
                                bottom: "26px",
                                borderRadius: "14px",
                                background:
                                    settings.theme === "dark"
                                        ? "#050505"
                                        : settings.theme === "sepia"
                                          ? "#fcf4e4"
                                          : "#ffffff",
                            }}
                        />
                        <div
                            style={{
                                position: "absolute",
                                top: "44px",
                                left: "42px",
                                right: "42px",
                                bottom: "44px",
                                overflow: "hidden",
                                color:
                                    settings.theme === "dark"
                                        ? "#f3f4f6"
                                        : settings.theme === "sepia"
                                          ? "#3a2f20"
                                          : "#171717",
                                opacity: settings.theme === "dark" ? 0.96 : 0.82,
                                fontFamily: settings.fontFamily,
                                fontSize: `${Math.max(17, settings.fontSize * 0.2)}px`,
                                lineHeight: 1.72,
                                textAlign: settings.alignment === "left" ? "left" : "justify",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                whiteSpace: "normal",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "18px",
                                }}
                            >
                                {previewParagraphs.map((paragraph, index) => (
                                        <p
                                            key={`${side}-${index}`}
                                            style={{
                                                margin: 0,
                                            }}
                                        >
                                            {paragraph}
                                        </p>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };
        const epubViewNode = (
            <>
                <div
                    className={`${desktopLayout || pagedMode ? "mx-auto" : ""} min-w-0 ${
                        pagedMode && desktopLayout
                            ? "h-full w-full"
                        : pagedMode
                              ? "h-full"
                              : "h-full min-h-0 w-full"
                    }`}
                    style={{
                        width: "100%",
                        maxWidth: viewportMaxWidth,
                    }}
                >
                    <div
                        ref={viewportRef}
                        className={`h-full min-h-0 min-w-0 w-full ${desktopLayout && !pagedMode ? "mx-auto" : ""}`}
                        data-reader-epub-viewport="true"
                        style={{
                            padding: viewportPadding,
                            maxWidth: viewportMaxWidth,
                            boxSizing: "border-box",
                        }}
                    >
                        <EpubView
                            key={`${book.filename}:${presentationMode}:${platformLayout}`}
                            ref={readerRef}
                            url={book.url}
                            location={location}
                            tocChanged={(value) =>
                                setToc(normalizeToc(value))
                            }
                            locationChanged={(value) => {
                                lastKnownLocationRef.current = value;
                                if (!mobileScrollMode) {
                                    setLocation(value);
                                }
                            }}
                            getRendition={configureRendition}
                            epubOptions={epubOptions}
                            epubViewStyles={{
                                viewHolder: {
                                    position: "relative",
                                    height: "100%",
                                    width: "100%",
                                    minWidth: mobileScrollMode
                                        ? "100%"
                                        : undefined,
                                    background: mobileScrollMode
                                        ? paperBackground
                                        : undefined,
                                    overflowX: "hidden",
                                    overflowY: "hidden",
                                    scrollbarWidth: "none",
                                    msOverflowStyle: "none",
                                },
                                view: {
                                    height: "100%",
                                    width: "100%",
                                    minWidth: mobileScrollMode
                                        ? "100%"
                                        : undefined,
                                    background: mobileScrollMode
                                        ? paperBackground
                                        : undefined,
                                    overflowX: "hidden",
                                    overflowY: desktopSectionPaging || mobileScrollMode
                                        ? "auto"
                                        : pagedMode
                                          ? "hidden"
                                          : "visible",
                                    WebkitOverflowScrolling: mobileScrollMode
                                        ? "touch"
                                        : undefined,
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
            [data-reader-epub-viewport="true"] .epub-container,
            [data-reader-epub-viewport="true"] .epub-view,
            [data-reader-epub-viewport="true"] .epub-view iframe {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
            [data-reader-epub-viewport="true"] .epub-container,
            [data-reader-epub-viewport="true"] .epub-view {
              display: block !important;
              margin: 0 !important;
            }
            [data-reader-epub-viewport="true"]::-webkit-scrollbar,
            [data-reader-epub-viewport="true"] *::-webkit-scrollbar,
            [data-reader-epub-viewport="true"] iframe::-webkit-scrollbar {
              width: 0;
              height: 0;
              display: none;
            }
          `}</style>
            </>
        );

        return (
            <div
                ref={containerRef}
                className={`relative flex min-h-0 px-0 py-0 ${
                    pagedMode
                        ? desktopLayout
                            ? "h-full justify-center items-center overflow-hidden"
                            : "items-center overflow-hidden px-2 py-2"
                        : "h-full w-full flex-col items-stretch overflow-hidden pb-16 pt-12 sm:pb-24 sm:pt-16"
                }`}
            >
                {desktopFocusPreview ? (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-2 py-10 sm:px-4 sm:py-12">
                        <div className="pointer-events-none absolute inset-y-0 left-0 hidden items-center justify-start md:flex">
                            {renderDesktopPeekShell("left")}
                        </div>
                        <div
                            className="relative h-full min-h-0 shrink-0 overflow-hidden rounded-[18px] shadow-[0_18px_46px_rgba(15,23,42,0.12)]"
                            style={{
                                width: "clamp(560px, 54vw, 760px)",
                                maxWidth: "760px",
                                background: paperBackground,
                            }}
                        >
                            {epubViewNode}
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center justify-end md:flex">
                            {renderDesktopPeekShell("right")}
                        </div>
                    </div>
                ) : (
                    <div
                        className={`relative min-w-0 w-full ${
                            pagedMode
                                ? showMobilePagedShell
                                    ? "h-full min-h-0 w-full max-w-[1040px] overflow-hidden rounded-[14px] shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:rounded-[18px] sm:shadow-[0_14px_32px_rgba(15,23,42,0.1)]"
                                    : "h-full min-h-0 overflow-hidden"
                                : "h-full min-h-0 flex-1 overflow-hidden"
                        }`}
                        style={{
                            background:
                                pagedMode || mobileScrollMode
                                    ? paperBackground
                                    : "transparent",
                            maxWidth: undefined,
                        }}
                    >
                        {epubViewNode}
                    </div>
                )}
                {!pagedMode ? (
                        <div
                            className={`mt-12 text-[#202124] ${
                                desktopLayout
                                    ? "mx-auto max-w-[760px] px-2"
                                    : "w-full px-0"
                            }`}
                        >
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
        );
    },
);
