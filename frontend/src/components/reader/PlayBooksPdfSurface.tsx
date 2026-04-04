import React, {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type {
  ReaderBook,
  ReaderSearchResult,
} from "../../types/readerBackendTypes";
import {
  clamp,
  type ReaderSelectionPayload,
  type ReaderSurfaceCommonProps,
  type ReaderSurfaceHandle,
} from "./playBooksReaderShared";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PlayBooksPdfSurfaceProps extends ReaderSurfaceCommonProps {
  book: ReaderBook;
  initialLocation: string | number | null;
  initialScale?: number;
}

function getDomRectPayload(
  rect: DOMRect | null | undefined,
): NonNullable<ReaderSelectionPayload["rect"]> | null {
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

export default forwardRef<ReaderSurfaceHandle, PlayBooksPdfSurfaceProps>(
  function PlayBooksPdfSurface(
    {
      book,
      initialLocation,
      onSaveLocation,
      onStateChange,
      onSelection,
      onVisibleNoteMarkersChange,
      onInteractionStateChange,
      onContextMenuRequest,
      onTapZoneRequest,
      presentationMode,
      platformLayout,
      settings,
      showFocusPreview = false,
      initialScale = 1,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const zoomWrapperRef = useRef<any>(null);
    const previousPageRef = useRef<number | null>(null);
    const previousViewportRef = useRef({ width: 0, height: 0 });
    const selectionFinalizeTimeoutRef = useRef<number | null>(null);
    const selectionInProgressRef = useRef(false);
    const touchSelectionActiveRef = useRef(false);
    const suppressSelectionEventsRef = useRef(false);
    const pendingTouchSelectionRef = useRef<
      Omit<ReaderSelectionPayload, "phase" | "source" | "kind"> | null
    >(null);
    const touchGestureRef = useRef<{
      x: number;
      y: number;
      time: number;
      moved: boolean;
      multiTouch: boolean;
    } | null>(null);
    const [pageNumber, setPageNumber] = useState(() => {
      const numeric =
        typeof initialLocation === "string"
          ? Number.parseInt(initialLocation, 10)
          : Number(initialLocation);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    });
    const [numPages, setNumPages] = useState<number>(1);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
    const [loadError, setLoadError] = useState("");
    const desktopLayout = platformLayout === "desktop";
    const pagedMode = presentationMode === "paged";
    const spreadMode =
      desktopLayout && pagedMode && settings.spread === "always";
    const desktopFocusPreview =
      desktopLayout && pagedMode && !spreadMode && showFocusPreview;
    const contentPadding = desktopLayout ? 12 : 8;
    const mobileZoomEnabled = !desktopLayout && pagedMode;
    const [mobileScale, setMobileScale] = useState(() =>
      clamp(Number(initialScale) || 1, 1, 3),
    );
    const [selectionInProgress, setSelectionInProgress] = useState(false);
    const [tempHighlightReady, setTempHighlightReady] = useState(false);
    const activeHeight = Math.max(
      320,
      viewport.height - (desktopLayout ? contentPadding * 2 : 28),
    );
    const navigationLocked = mobileZoomEnabled && mobileScale > 1.01;

    const syncMobileTransform = (nextScale = 1, duration = 0) => {
      const clampedScale = clamp(nextScale, 1, 3);
      setMobileScale(clampedScale);
      if (zoomWrapperRef.current?.setTransform) {
        zoomWrapperRef.current.setTransform(0, 0, clampedScale, duration, "easeOutCubic");
      }
    };

    useEffect(() => {
      selectionInProgressRef.current = selectionInProgress;
    }, [selectionInProgress]);

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

    const emitSelection = useCallback(
      (
        payload: Omit<
          ReaderSelectionPayload,
          "phase" | "source" | "kind"
        > | null,
        phase: ReaderSelectionPayload["phase"],
        source: ReaderSelectionPayload["source"],
        kind: ReaderSelectionPayload["kind"],
      ) => {
        onSelection?.(
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
      [onSelection],
    );

    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const update = () => {
        const rect = node.getBoundingClientRect();
        setViewport({
          width: Math.max(180, Math.floor(rect.width)),
          height: Math.max(320, Math.floor(rect.height)),
        });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      onVisibleNoteMarkersChange?.([]);
      return () => onVisibleNoteMarkersChange?.([]);
    }, [onVisibleNoteMarkersChange]);

    useEffect(() => {
      onInteractionStateChange?.({
        lockNavigation: navigationLocked,
        scale: mobileZoomEnabled ? mobileScale : 1,
        selectionInProgress,
        tempHighlightReady,
      });
    }, [
      mobileScale,
      mobileZoomEnabled,
      navigationLocked,
      onInteractionStateChange,
      selectionInProgress,
      tempHighlightReady,
    ]);

    useEffect(() => {
      const numeric =
        typeof initialLocation === "string"
          ? Number.parseInt(initialLocation, 10)
          : Number(initialLocation);
      if (Number.isFinite(numeric) && numeric > 0) {
        setPageNumber(numeric);
      }
    }, [initialLocation]);

    useEffect(() => {
      const nextScale = mobileZoomEnabled
        ? clamp(Number(initialScale) || 1, 1, 3)
        : 1;
      syncMobileTransform(nextScale, 0);
      previousPageRef.current = pageNumber;
    }, [book.filename, initialScale, mobileZoomEnabled]);

    useEffect(() => {
      if (!mobileZoomEnabled) return;
      if (previousPageRef.current === null) {
        previousPageRef.current = pageNumber;
        return;
      }
      if (previousPageRef.current !== pageNumber) {
        previousPageRef.current = pageNumber;
        syncMobileTransform(1, 0);
      }
    }, [mobileZoomEnabled, pageNumber]);

    useEffect(() => {
      if (!mobileZoomEnabled) {
        previousViewportRef.current = viewport;
        return;
      }
      const previousViewport = previousViewportRef.current;
      if (
        previousViewport.width > 0 &&
        previousViewport.height > 0 &&
        (previousViewport.width !== viewport.width ||
          previousViewport.height !== viewport.height)
      ) {
        syncMobileTransform(1, 0);
      }
      previousViewportRef.current = viewport;
    }, [mobileZoomEnabled, viewport]);

    useEffect(() => {
      const safePage = clamp(pageNumber, 1, Math.max(numPages, 1));
      const visibleText = pageTexts[safePage] || "";
      const progressPercent = (safePage / Math.max(numPages, 1)) * 100;
      const locationPayload = {
        location: safePage,
        locationType: "pdf_page",
        progressPercent,
        pageLabel: String(safePage),
        viewState: {
          flow: pagedMode ? "paginated" : "scrolled",
          scale: mobileZoomEnabled ? mobileScale : 1,
        },
      };
      onStateChange({
        currentPage: safePage,
        totalPages: Math.max(numPages, 1),
        pageLabel: `Page ${safePage}`,
        chapterLabel: "PDF",
        progressPercent,
        pagesLeftLabel: `${Math.max(numPages - safePage, 0)} pages left in book`,
        visibleText,
        locationPayload,
      });
      onSaveLocation(locationPayload);
    }, [
      numPages,
      onSaveLocation,
      onStateChange,
      pageNumber,
      pageTexts,
      pagedMode,
      mobileScale,
      mobileZoomEnabled,
    ]);

    const goToPage = (page: number) => {
      setPageNumber(clamp(page, 1, Math.max(numPages, 1)));
    };

    useImperativeHandle(
      ref,
      () => ({
        prev: () => goToPage(pageNumber - (spreadMode ? 2 : 1)),
        next: () => goToPage(pageNumber + (spreadMode ? 2 : 1)),
        clearSelection: (options) => {
          suppressSelectionEventsRef.current = true;
          pendingTouchSelectionRef.current = null;
          setSelectionInProgress(false);
          if (!options?.preserveTemporary) {
            setTempHighlightReady(false);
          }
          window.getSelection()?.removeAllRanges();
        },
        goToPage,
        goToSearchResult: (result: ReaderSearchResult) => {
          if (typeof result.page === "number") {
            goToPage(result.page);
          }
        },
        goToTocTarget: (target) => {
          if (typeof target.page === "number") {
            goToPage(target.page);
          }
        },
      }),
      [numPages, pageNumber, spreadMode],
    );

    const getSelectionPayload = useCallback((): Omit<
      ReaderSelectionPayload,
      "phase" | "source" | "kind"
    > | null => {
      if (!containerRef.current) return null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }
      const text = selection.toString().trim();
      if (!text) {
        return null;
      }
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        return null;
      }
      const boundingRect = range.getBoundingClientRect();
      const fallbackRect = range.getClientRects().item(0);
      const resolvedRect =
        boundingRect.width > 0 || boundingRect.height > 0
          ? boundingRect
          : fallbackRect;
      return {
        text,
        rect: getDomRectPayload(resolvedRect),
        anchor: {
          page: pageNumber,
        },
      };
    }, [pageNumber]);

    const handleMouseSelection = () => {
      setSelectionInProgress(false);
      setTempHighlightReady(false);
      emitSelection(getSelectionPayload(), "final", "mouse", "selection");
    };

    const finalizeTouchSelection = () => {
      clearPendingSelectionFinalize();
      selectionFinalizeTimeoutRef.current = window.setTimeout(() => {
        const payload = getSelectionPayload();
        const hasValidRect = Boolean(
          payload?.rect &&
            ((payload.rect.width || 0) > 0 || (payload.rect.height || 0) > 0),
        );
        const hasMinText = String(payload?.text || "").trim().length >= 2;
        selectionFinalizeTimeoutRef.current = null;
        if (payload && hasValidRect && hasMinText) {
          pendingTouchSelectionRef.current = payload;
          setTempHighlightReady(false);
          return;
        }
        pendingTouchSelectionRef.current = null;
        setSelectionInProgress(false);
        setTempHighlightReady(false);
        emitSelection(null, "final", "touch", "selection");
      }, 180);
    };

    useEffect(() => {
      if (desktopLayout || typeof document === "undefined") {
        return;
      }
      const handleSelectionChange = () => {
        if (suppressSelectionEventsRef.current) {
          suppressSelectionEventsRef.current = false;
          return;
        }
        if (
          !touchSelectionActiveRef.current &&
          !selectionInProgressRef.current
        ) {
          return;
        }
        clearPendingSelectionFinalize();
        const payload = getSelectionPayload();
        if (!payload) {
          if (pendingTouchSelectionRef.current) {
            const pendingSelection = pendingTouchSelectionRef.current;
            pendingTouchSelectionRef.current = null;
            setSelectionInProgress(false);
            setTempHighlightReady(true);
            emitSelection(
              pendingSelection,
              "final",
              "touch",
              "temp-highlight",
            );
            return;
          }
          setSelectionInProgress(false);
          setTempHighlightReady(false);
          emitSelection(null, "draft", "touch", "selection");
          return;
        }
        pendingTouchSelectionRef.current = null;
        setSelectionInProgress(true);
        setTempHighlightReady(false);
        emitSelection(payload, "draft", "touch", "selection");
      };
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => {
        document.removeEventListener(
          "selectionchange",
          handleSelectionChange,
        );
      };
    }, [
      clearPendingSelectionFinalize,
      desktopLayout,
      emitSelection,
      getSelectionPayload,
    ]);

    const usePeekLayout =
      desktopFocusPreview ||
      (!desktopLayout && pagedMode && viewport.width >= 1280);
    const mobilePageWidth = Math.max(170, viewport.width - 20);
    const activeWidth = Math.max(
      spreadMode
        ? 260
        : desktopFocusPreview
          ? 420
          : desktopLayout
            ? 420
            : Math.max(200, mobilePageWidth),
      Math.min(
        spreadMode
          ? 620
          : desktopFocusPreview
            ? 760
            : desktopLayout
              ? 1180
              : mobilePageWidth,
        Math.round(
          spreadMode
            ? (viewport.width - contentPadding * 2 - 28) / 2
            : viewport.width *
                (desktopFocusPreview
                  ? 0.46
                  : desktopLayout
                    ? 0.9
                    : usePeekLayout
                      ? 0.66
                      : 0.94),
        ),
      ),
    );
    const peekWidth = Math.max(
      150,
      Math.min(260, Math.round(activeWidth * 0.26)),
    );
    const pageToneFilter =
      settings.theme === "dark"
        ? "invert(1) hue-rotate(180deg) brightness(0.94) contrast(0.96)"
        : settings.theme === "sepia"
          ? "sepia(0.42) saturate(0.82) brightness(0.98)"
          : "none";

    const capturePageText = (
      pageIndex: number,
      value: { items?: Array<unknown> } | undefined,
    ) => {
      const items: Array<unknown> = Array.isArray(value?.items)
        ? value.items
        : [];
      const joined = items
        .map((item) =>
          item && typeof item === "object" && "str" in item
            ? String((item as { str?: string }).str || "").trim()
            : "",
        )
        .filter(Boolean)
        .join(" ");
      setPageTexts((prev) =>
        prev[pageIndex] === joined ? prev : { ...prev, [pageIndex]: joined },
      );
    };

    const renderPdfPage = (targetPage: number, mode: "peek" | "active") => {
      if (targetPage < 1 || targetPage > numPages) {
        return null;
      }

      const isActive = mode === "active";
      const focusPreviewPeek = desktopFocusPreview && !isActive;
      const focusPreviewCardWidth = Math.max(
        520,
        Math.round(activeWidth * 0.94),
      );
      const cardWidth = isActive
        ? activeWidth
        : focusPreviewPeek
          ? focusPreviewCardWidth
          : peekWidth;
      const peekPageWidth = focusPreviewPeek
        ? focusPreviewCardWidth
        : peekWidth;
      const sizeProps =
        isActive && !desktopLayout && pagedMode
          ? { width: activeWidth }
          : isActive && desktopLayout && pagedMode && !desktopFocusPreview
          ? { height: activeHeight }
          : focusPreviewPeek
            ? { width: peekPageWidth }
            : { width: isActive ? activeWidth : peekWidth };

      return (
        <div
          className={`pdf-page-shell overflow-hidden ${
            pagedMode && (desktopFocusPreview || !desktopLayout)
              ? isActive
                ? "shadow-[0_18px_46px_rgba(15,23,42,0.12)]"
                : "hidden opacity-72 md:block"
              : ""
          }`}
          style={{
            width:
              isActive && desktopLayout && pagedMode && !desktopFocusPreview
                ? "fit-content"
                : `${cardWidth}px`,
            minHeight: focusPreviewPeek
              ? `${Math.max(560, activeHeight + 96)}px`
              : undefined,
            transform:
              pagedMode && (desktopFocusPreview || !desktopLayout)
                ? isActive
                  ? "scale(1)"
                  : desktopFocusPreview
                    ? "scale(1)"
                    : "scale(0.95)"
                : "none",
            borderRadius:
              pagedMode && (desktopFocusPreview || !desktopLayout)
                ? "18px"
                : "0px",
            display: "flex",
            justifyContent: focusPreviewPeek ? "center" : "center",
            alignItems:
              focusPreviewPeek || !desktopLayout ? "center" : "flex-start",
            filter: pageToneFilter,
            backgroundColor:
              settings.theme === "dark"
                ? "#111318"
                : settings.theme === "sepia"
                  ? "#f1e6d1"
                  : "#ffffff",
          }}
        >
          <Page
            pageNumber={targetPage}
            {...sizeProps}
            renderTextLayer
            renderAnnotationLayer
            onGetTextSuccess={(value) => capturePageText(targetPage, value)}
          />
        </div>
      );
    };

    const renderDesktopFocusPeekPage = (
      targetPage: number,
      side: "left" | "right",
    ) => {
      if (targetPage < 1 || targetPage > numPages) {
        return null;
      }

      const peekCardWidth = Math.max(620, Math.round(activeWidth * 0.96));
      const visibleWidth = Math.max(132, Math.round(activeWidth * 0.17));
      const shellHeight = Math.max(620, activeHeight + 116);
      const revealDepth = Math.max(74, Math.round(peekCardWidth * 0.13));
      const hiddenOffset = Math.max(
        0,
        peekCardWidth - visibleWidth - revealDepth,
      );

      return (
        <div
          className="hidden shrink-0 overflow-hidden md:block"
          style={{
            width: `${visibleWidth}px`,
            height: `${shellHeight}px`,
            pointerEvents: "none",
          }}
        >
          <div
            className="pdf-page-shell relative h-full overflow-hidden shadow-[0_18px_42px_rgba(15,23,42,0.10)]"
            style={{
              width: `${peekCardWidth}px`,
              height: "100%",
              borderRadius: "18px",
              backgroundColor:
                settings.theme === "dark"
                  ? "#111318"
                  : settings.theme === "sepia"
                    ? "#f1e6d1"
                    : "#ffffff",
              filter: pageToneFilter,
              transform: `translateX(${side === "left" ? -hiddenOffset : 0}px)`,
            }}
          >
            <div
              className="flex h-full items-center justify-center"
              style={{
                paddingTop: "32px",
                paddingBottom: "32px",
              }}
            >
              <Page
                pageNumber={targetPage}
                width={peekCardWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </div>
        </div>
      );
    };

    const resolveTapZone = (clientX: number, bounds: DOMRect) => {
      const localX = clientX - bounds.left;
      const edgeWidth = Math.min(120, Math.max(72, bounds.width * 0.22));
      if (localX <= edgeWidth) {
        return "left" as const;
      }
      if (localX >= bounds.width - edgeWidth) {
        return "right" as const;
      }
      return "center" as const;
    };

    const handleMobileTouchStart = (
      event: React.TouchEvent<HTMLDivElement>,
    ) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchSelectionActiveRef.current = event.touches.length === 1;
      clearPendingSelectionFinalize();
      touchGestureRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        moved: false,
        multiTouch: event.touches.length > 1,
      };
    };

    const handleMobileTouchMove = (
      event: React.TouchEvent<HTMLDivElement>,
    ) => {
      const touch = event.touches[0];
      const gesture = touchGestureRef.current;
      if (!touch || !gesture) return;
      if (event.touches.length > 1) {
        gesture.multiTouch = true;
      }
      if (
        Math.abs(touch.clientX - gesture.x) > 10 ||
        Math.abs(touch.clientY - gesture.y) > 10
      ) {
        gesture.moved = true;
      }
    };

    const handleMobileTouchEnd = (
      event: React.TouchEvent<HTMLDivElement>,
    ) => {
      touchSelectionActiveRef.current = false;
      finalizeTouchSelection();
      const gesture = touchGestureRef.current;
      touchGestureRef.current = null;
      if (!gesture || !onTapZoneRequest) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "a, button, input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch || gesture.multiTouch) {
        return;
      }
      if (
        selectionInProgressRef.current ||
        String(window.getSelection?.()?.toString?.() || "").trim()
      ) {
        return;
      }
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      const navigationEnabled = mobileScale <= 1.01;
      if (
        navigationEnabled &&
        pagedMode &&
        Math.abs(deltaX) > 60 &&
        Math.abs(deltaX) > Math.abs(deltaY)
      ) {
        onTapZoneRequest(deltaX < 0 ? "right" : "left");
        return;
      }
      const isTap =
        !gesture.moved &&
        Math.abs(deltaX) < 10 &&
        Math.abs(deltaY) < 10 &&
        Date.now() - gesture.time < 320;
      if (!isTap) return;
      const currentTarget = event.currentTarget;
      const zone = resolveTapZone(
        touch.clientX,
        currentTarget.getBoundingClientRect(),
      );
      onTapZoneRequest(
        !navigationEnabled && zone !== "center" ? "center" : zone,
      );
    };

    return (
      <div
        ref={containerRef}
        className={`relative flex h-full min-h-0 justify-center px-0 py-0 ${
          pagedMode
            ? desktopFocusPreview
              ? "items-center overflow-hidden"
              : desktopLayout
                ? "items-start overflow-hidden"
                : "items-center overflow-hidden px-2 py-2"
            : "items-start overflow-x-hidden overflow-y-auto"
        }`}
        onMouseUp={handleMouseSelection}
        onTouchStart={() => {
          if (!desktopLayout && !pagedMode) {
            touchSelectionActiveRef.current = true;
            clearPendingSelectionFinalize();
          }
        }}
        onTouchEnd={() => {
          if (!desktopLayout && !pagedMode) {
            finalizeTouchSelection();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenuRequest?.();
        }}
      >
        <style>{`
          .react-pdf__Page__textContent {
            user-select: text;
            -webkit-user-select: text;
            touch-action: auto;
            -webkit-touch-callout: default;
          }
          .react-pdf__Page__textContent ::selection,
          .react-pdf__Page__textContent span::selection {
            background: rgba(243, 221, 115, 0.38);
            color: inherit;
          }
          .react-pdf__Page__canvas {
            max-width: 100%;
            height: auto !important;
          }
          .pdf-page-shell canvas {
            max-width: 100%;
            height: auto !important;
          }
          .pdf-page-shell .react-pdf__Page {
            background: transparent !important;
          }
        `}</style>
        <Document
          file={book.url}
          onLoadSuccess={({ numPages: loadedNumPages }) => {
            setLoadError("");
            setNumPages(loadedNumPages || 1);
          }}
          onLoadError={(error) => {
            console.error("PDF reader load failed", error);
            setLoadError("Could not render this PDF in the cloud reader.");
          }}
          loading={<div className="text-base text-slate-500">Loading PDF...</div>}
          error={
            <div className="text-base text-rose-600">
              {loadError || "Could not render PDF."}
            </div>
          }
          className="w-full"
        >
          {pagedMode ? (
            <div
              className={`mx-auto flex w-full ${
                desktopLayout
                  ? desktopFocusPreview
                    ? "relative items-center justify-center overflow-hidden px-4"
                    : "items-start justify-center gap-7"
                  : "max-w-[1720px] items-center justify-center overflow-hidden"
              }`}
              style={{
                maxWidth: undefined,
                paddingTop: `${desktopFocusPreview ? 34 : contentPadding}px`,
                paddingBottom: `${desktopFocusPreview ? 34 : contentPadding}px`,
              }}
            >
              {spreadMode ? (
                <>
                  {renderPdfPage(pageNumber, "active")}
                  {pageNumber < numPages
                    ? renderPdfPage(pageNumber + 1, "active")
                    : null}
                </>
              ) : (
                <>
                  {desktopFocusPreview ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 hidden items-center justify-start md:flex"
                      style={{ paddingLeft: "0px" }}
                    >
                      {renderDesktopFocusPeekPage(pageNumber - 1, "left")}
                    </div>
                  ) : usePeekLayout ? (
                    renderPdfPage(pageNumber - 1, "peek")
                  ) : null}
                  {mobileZoomEnabled ? (
                    <div
                      className="flex w-full items-center justify-center overflow-hidden"
                      style={{
                        minHeight: `${Math.max(320, activeHeight)}px`,
                      }}
                      onTouchStart={handleMobileTouchStart}
                      onTouchMove={handleMobileTouchMove}
                      onTouchEnd={handleMobileTouchEnd}
                    >
                      <TransformWrapper
                        initialScale={clamp(Number(initialScale) || 1, 1, 3)}
                        minScale={1}
                        maxScale={3}
                        centerOnInit
                        limitToBounds={false}
                        doubleClick={{ disabled: true }}
                        wheel={{ disabled: true }}
                        panning={{ disabled: mobileScale <= 1.01 }}
                        onInit={(refInstance) => {
                          zoomWrapperRef.current = refInstance;
                        }}
                        onZoomStop={(refInstance) => {
                          setMobileScale(refInstance?.state?.scale || 1);
                        }}
                        onPanningStop={(refInstance) => {
                          setMobileScale(refInstance?.state?.scale || mobileScale);
                        }}
                      >
                        <TransformComponent
                          wrapperStyle={{
                            width: "100%",
                            height: "100%",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {renderPdfPage(pageNumber, "active")}
                        </TransformComponent>
                      </TransformWrapper>
                    </div>
                  ) : (
                    renderPdfPage(pageNumber, "active")
                  )}
                  {desktopFocusPreview ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 hidden items-center justify-end md:flex"
                      style={{ paddingRight: "0px" }}
                    >
                      {renderDesktopFocusPeekPage(pageNumber + 1, "right")}
                    </div>
                  ) : usePeekLayout ? (
                    renderPdfPage(pageNumber + 1, "peek")
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div
              className="mx-auto flex w-full justify-center"
              style={{
                paddingTop: `${contentPadding}px`,
                paddingBottom: `${contentPadding}px`,
              }}
            >
              {renderPdfPage(pageNumber, "active")}
            </div>
          )}
        </Document>
      </div>
    );
  },
);
