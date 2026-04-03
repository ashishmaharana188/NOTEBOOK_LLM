import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { ReaderBook, ReaderSearchResult } from "../../types/readerBackendTypes";
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
      searchQuery = "",
      presentationMode,
      platformLayout,
      settings,
      showFocusPreview = false,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [pageNumber, setPageNumber] = useState(() => {
      const numeric =
        typeof initialLocation === "string" ? Number.parseInt(initialLocation, 10) : Number(initialLocation);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    });
    const [numPages, setNumPages] = useState<number>(1);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
    const [loadError, setLoadError] = useState("");
    const desktopLayout = platformLayout === "desktop";
    const pagedMode = presentationMode === "paged";
    const spreadMode = desktopLayout && pagedMode && settings.spread === "always";
    const desktopFocusPreview =
      desktopLayout && pagedMode && !spreadMode && showFocusPreview;
    const contentPadding = desktopLayout ? 12 : 16;
    const activeHeight = Math.max(320, viewport.height - contentPadding * 2);

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
      const numeric =
        typeof initialLocation === "string" ? Number.parseInt(initialLocation, 10) : Number(initialLocation);
      if (Number.isFinite(numeric) && numeric > 0) {
        setPageNumber(numeric);
      }
    }, [initialLocation]);

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
    }, [numPages, onSaveLocation, onStateChange, pageNumber, pageTexts, pagedMode]);

    const goToPage = (page: number) => {
      setPageNumber(clamp(page, 1, Math.max(numPages, 1)));
    };

    useImperativeHandle(
      ref,
      () => ({
        prev: () => goToPage(pageNumber - (spreadMode ? 2 : 1)),
        next: () => goToPage(pageNumber + (spreadMode ? 2 : 1)),
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

    const handleSelection = () => {
      if (!onSelection || !containerRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        onSelection({ text: "", rect: null });
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        onSelection({ text: "", rect: null });
        return;
      }
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        onSelection({ text: "", rect: null });
        return;
      }
      const boundingRect = range.getBoundingClientRect();
      const fallbackRect = range.getClientRects().item(0);
      const resolvedRect =
        boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : fallbackRect;
      onSelection({
        text,
        rect: getDomRectPayload(resolvedRect),
      });
    };

    const usePeekLayout =
      desktopFocusPreview || (!desktopLayout && pagedMode && viewport.width >= 1280);
    const activeWidth = Math.max(
      spreadMode ? 260 : desktopFocusPreview ? 420 : 420,
      Math.min(
        spreadMode ? 620 : desktopFocusPreview ? 760 : desktopLayout ? 1180 : 960,
        Math.round(
          spreadMode
            ? (viewport.width - contentPadding * 2 - 28) / 2
            : viewport.width *
              (desktopFocusPreview ? 0.46 : desktopLayout ? 0.9 : usePeekLayout ? 0.66 : 0.82),
        ),
      ),
    );
    const peekWidth = Math.max(150, Math.min(260, Math.round(activeWidth * 0.26)));
    const pageToneFilter =
      settings.theme === "dark"
        ? "invert(1) hue-rotate(180deg) brightness(0.94) contrast(0.96)"
        : settings.theme === "sepia"
          ? "sepia(0.42) saturate(0.82) brightness(0.98)"
          : "none";

    const highlightRenderer = useMemo(() => {
      if (!searchQuery.trim()) return undefined;
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matcher = new RegExp(`(${escaped})`, "ig");
      return ({ str }: { str: string }) => {
        if (!str) return str;
        return str.replace(matcher, '<mark style="background:#f3dd73;padding:0 0.02em;">$1</mark>');
      };
    }, [searchQuery]);

    const capturePageText = (
      pageIndex: number,
      value: { items?: Array<unknown> } | undefined,
    ) => {
      const items: Array<unknown> = Array.isArray(value?.items) ? value.items : [];
      const joined = items
        .map((item) =>
          item && typeof item === "object" && "str" in item
            ? String((item as { str?: string }).str || "").trim()
            : "",
        )
        .filter(Boolean)
        .join(" ");
      setPageTexts((prev) => (prev[pageIndex] === joined ? prev : { ...prev, [pageIndex]: joined }));
    };

    const renderPdfPage = (targetPage: number, mode: "peek" | "active") => {
      if (targetPage < 1 || targetPage > numPages) {
        return null;
      }

      const pageProps: {
        customTextRenderer?: ({ str }: { str: string }) => string;
      } = {};
      if (mode === "active" && highlightRenderer) {
        pageProps.customTextRenderer = highlightRenderer;
      }

      const isActive = mode === "active";
      const focusPreviewPeek = desktopFocusPreview && !isActive;
      const focusPreviewCardWidth = Math.max(520, Math.round(activeWidth * 0.94));
      const cardWidth =
        isActive
          ? activeWidth
          : focusPreviewPeek
            ? focusPreviewCardWidth
            : peekWidth;
      const peekPageWidth = focusPreviewPeek
        ? focusPreviewCardWidth
        : peekWidth;
      const alignSide =
        targetPage < pageNumber ? "flex-end" : targetPage > pageNumber ? "flex-start" : "center";
      const sizeProps =
        isActive && desktopLayout && pagedMode && !desktopFocusPreview
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
            minHeight: focusPreviewPeek ? `${Math.max(560, activeHeight + 96)}px` : undefined,
            transform:
              pagedMode && (desktopFocusPreview || !desktopLayout)
                ? isActive
                  ? "scale(1)"
                  : desktopFocusPreview
                    ? "scale(1)"
                    : "scale(0.95)"
                : "none",
            borderRadius:
              pagedMode && (desktopFocusPreview || !desktopLayout) ? "18px" : "0px",
            display: "flex",
            justifyContent: focusPreviewPeek ? "center" : "center",
            alignItems: focusPreviewPeek ? "center" : "flex-start",
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
            {...pageProps}
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
      const hiddenOffset = Math.max(0, peekCardWidth - visibleWidth - revealDepth);

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

    return (
      <div
        ref={containerRef}
        className={`relative flex h-full min-h-0 justify-center px-0 py-0 ${
          pagedMode
            ? desktopFocusPreview
              ? "items-center overflow-hidden"
              : "items-start overflow-hidden"
            : "items-start overflow-x-hidden overflow-y-auto"
        }`}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        <style>{`
          .react-pdf__Page__textContent {
            user-select: text;
            -webkit-user-select: text;
          }
          .react-pdf__Page__textContent ::selection {
            background: #f3dd73;
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
          error={<div className="text-base text-rose-600">{loadError || "Could not render PDF."}</div>}
          className="w-full"
        >
          {pagedMode ? (
            <div
              className={`mx-auto flex w-full ${
                desktopLayout
                  ? desktopFocusPreview
                    ? "relative items-center justify-center overflow-hidden px-4"
                    : "items-start justify-center gap-7"
                  : "max-w-[1720px] items-center justify-center gap-6 overflow-hidden"
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
                  {pageNumber < numPages ? renderPdfPage(pageNumber + 1, "active") : null}
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
                  ) : usePeekLayout
                    ? renderPdfPage(pageNumber - 1, "peek")
                    : null}
                  {renderPdfPage(pageNumber, "active")}
                  {desktopFocusPreview ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 hidden items-center justify-end md:flex"
                      style={{ paddingRight: "0px" }}
                    >
                      {renderDesktopFocusPeekPage(pageNumber + 1, "right")}
                    </div>
                  ) : usePeekLayout
                    ? renderPdfPage(pageNumber + 1, "peek")
                    : null}
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
