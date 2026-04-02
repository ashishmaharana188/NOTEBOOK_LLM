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
    const contentPadding = desktopLayout ? 20 : 16;
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
        prev: () => goToPage(pageNumber - 1),
        next: () => goToPage(pageNumber + 1),
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
      [numPages, pageNumber],
    );

    const handleSelection = () => {
      if (!onSelection || !containerRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (!text) return;
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;
      onSelection(text);
    };

    const usePeekLayout = !desktopLayout && pagedMode && viewport.width >= 1280;
    const activeWidth = Math.max(
      420,
      Math.min(
        desktopLayout ? 1180 : 960,
        Math.round(viewport.width * (desktopLayout ? 0.9 : usePeekLayout ? 0.66 : 0.82)),
      ),
    );
    const peekWidth = Math.max(150, Math.min(260, Math.round(activeWidth * 0.26)));

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

      return (
        <div
          className={`overflow-hidden ${
            !desktopLayout && pagedMode
              ? isActive
                ? "shadow-[0_18px_46px_rgba(15,23,42,0.12)]"
                : "hidden opacity-68 xl:block"
              : ""
          }`}
          style={{
            width: `${isActive ? activeWidth : peekWidth}px`,
            transform: !desktopLayout && pagedMode ? (isActive ? "scale(1)" : "scale(0.95)") : "none",
            borderRadius: !desktopLayout && pagedMode ? "18px" : "0px",
          }}
        >
          <Page
            pageNumber={targetPage}
            {...(isActive && desktopLayout && pagedMode
              ? { height: activeHeight }
              : { width: isActive ? activeWidth : peekWidth })}
            renderTextLayer
            renderAnnotationLayer
            onGetTextSuccess={(value) => capturePageText(targetPage, value)}
            {...pageProps}
          />
        </div>
      );
    };

    return (
      <div
        ref={containerRef}
        className={`relative flex h-full min-h-0 justify-center px-0 py-0 ${
          pagedMode ? "items-start overflow-hidden" : "items-start overflow-x-hidden overflow-y-auto"
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
                  ? "items-start justify-center"
                  : "max-w-[1720px] items-center justify-center gap-6 overflow-hidden"
              }`}
              style={{
                maxWidth: undefined,
                paddingTop: `${contentPadding}px`,
                paddingBottom: `${contentPadding}px`,
              }}
            >
              {usePeekLayout ? renderPdfPage(pageNumber - 1, "peek") : null}
              {renderPdfPage(pageNumber, "active")}
              {usePeekLayout ? renderPdfPage(pageNumber + 1, "peek") : null}
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
