import React, { useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { usePdfControl } from "../../hooks/reader/usePdfControl";
import { useReaderSetting } from "../../hooks/reader/useReaderSetting";
import type { ReaderAnnotation, ReaderProps } from "../../types/readerBackendTypes";
import {
  IconLineHeight,
  IconMinus,
  IconPanelClose,
  IconPlus,
  IconSettings,
} from "./readerIcons";
import ReaderAnnotationPanel from "./ReaderAnnotationPanel";
import ReaderPanelSection from "./ReaderPanelSection";
import useIsMobile from "../../hooks/appTools/useIsMobile";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const THEME_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Sepia", value: "sepia" },
  { label: "Dark", value: "dark" },
] as const;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfReaderComponentProps extends ReaderProps {
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

export default function PdfReader({
  book,
  initialLocation,
  onSaveLocation,
  onSelection,
  chromeVisible,
  annotations,
  onAddBookmark,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onJumpToAnnotation,
}: PdfReaderComponentProps) {
  const isMobile = useIsMobile();
  const {
    numPages,
    setNumPages,
    pageNumber,
    changePage,
    scale,
    zoomIn,
    zoomOut,
    setZoom,
    viewMode,
    toggleViewMode,
  } = usePdfControl(initialLocation, (loc) => onSaveLocation(loc));
  const { settings, updateSetting, themeStyles } = useReaderSetting();
  const [showPanel, setShowPanel] = useState(false);
  const [loadError, setLoadError] = useState("");

  const handleMouseUp = () => {
    if (!onSelection) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (text.length > 0) {
      onSelection(text);
    }
  };

  const pageWidth = useMemo(() => {
    if (isMobile) {
      return viewMode === "double" ? 180 : 340;
    }
    if (viewMode === "double") {
      return 460;
    }
    return 920;
  }, [isMobile, viewMode]);

  const shellBg = themeStyles[settings.theme].body.background;
  const shellColor = themeStyles[settings.theme].body.color;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: shellBg }}
    >
      <style>{`
        .react-pdf__Page__textContent {
          user-select: text;
          -webkit-user-select: text;
          pointer-events: auto;
          line-height: 1;
        }

        .react-pdf__Page__textContent span {
          color: transparent !important;
          background: transparent !important;
          opacity: 1 !important;
          cursor: text;
        }

        .reader-pdf-surface .react-pdf__Page {
          box-shadow: 0 28px 50px rgba(15, 23, 42, 0.15);
        }

        .reader-pdf-surface ::selection {
          background: rgba(59, 130, 246, 0.35) !important;
          color: transparent !important;
        }
      `}</style>

      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className={`absolute right-3 top-3 z-50 bg-white px-3 py-2 text-primary shadow-lg transition-all sm:right-4 sm:top-4 ${
          showPanel || chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
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
              <div className="text-xs text-muted">{book.title}</div>
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

          <div className="flex-1 space-y-5 overflow-y-auto">
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

            <ReaderPanelSection title="Contents" defaultOpen>
              <div className="space-y-2 text-sm text-primary">
                <div className="text-xs text-muted">
                  Page {pageNumber} of {numPages || "--"}
                </div>
                <div className="flex items-center gap-5 pt-1 text-xs font-medium uppercase tracking-[0.18em]">
                <button
                  onClick={() => changePage(viewMode === "double" ? -2 : -1)}
                  disabled={pageNumber <= 1}
                  className="text-primary disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => changePage(viewMode === "double" ? 2 : 1)}
                  disabled={pageNumber >= (numPages || 9999)}
                  className="text-primary disabled:opacity-40"
                >
                  Next
                </button>
                </div>
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
                  <button
                    onClick={zoomOut}
                    className="text-primary"
                    title="Zoom out"
                  >
                    <IconMinus />
                  </button>
                  <span>{Math.round(scale * 100)}%</span>
                  <button
                    onClick={zoomIn}
                    className="text-primary"
                    title="Zoom in"
                  >
                    <IconPlus />
                  </button>
                </div>
                <input
                  type="range"
                  min={70}
                  max={220}
                  step={5}
                  value={Math.round(scale * 100)}
                  onChange={(event) =>
                    setZoom(Number(event.target.value) / 100)
                  }
                  className="w-full accent-black"
                />
              </div>

              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                View
                <select
                  value={viewMode}
                  onChange={(event) => {
                    const nextMode = event.target.value;
                    if (nextMode !== viewMode) {
                      toggleViewMode();
                    }
                  }}
                  className="mt-2 w-full bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  <option value="single">Single page</option>
                  <option value="double">Spread</option>
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
                  <span>Narrow</span>
                  <span>{settings.pageMargin}%</span>
                  <span>Wide</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={14}
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
                    updateSetting("theme", event.target.value as "light" | "sepia" | "dark")
                  }
                  className="mt-2 w-full bg-transparent px-0 py-1 text-sm text-primary outline-none"
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

      <button
        onClick={() => changePage(viewMode === "double" ? -2 : -1)}
        disabled={pageNumber <= 1}
        className="absolute left-0 top-0 bottom-0 z-30 w-[10%] cursor-w-resize bg-transparent disabled:pointer-events-none"
        title="Previous page"
      />
      <button
        onClick={() => changePage(viewMode === "double" ? 2 : 1)}
        disabled={pageNumber >= (numPages || 9999)}
        className="absolute right-0 top-0 bottom-0 z-30 w-[10%] cursor-e-resize bg-transparent disabled:pointer-events-none"
        title="Next page"
      />

      <div
        className="reader-pdf-surface h-full w-full overflow-auto"
        onPointerUp={handleMouseUp}
      >
        <div
          className="mx-auto flex min-h-full max-w-[1680px] items-center justify-center px-3 py-6 sm:px-6 sm:py-10"
          style={{
            paddingLeft: `${settings.pageMargin}%`,
            paddingRight: `${settings.pageMargin}%`,
          }}
        >
          <Document
            file={book.url}
            onLoadSuccess={({ numPages: loadedNumPages }) =>
              {
                setLoadError("");
                setNumPages(loadedNumPages);
              }
            }
            onLoadError={(error) => {
              console.error("PDF Error:", error);
              setLoadError("Could not render this PDF in the cloud reader.");
            }}
            loading={
              <div className="px-6 py-8 text-sm text-slate-500">
                Loading PDF...
              </div>
            }
            error={
              <div className="px-6 py-8 text-sm text-rose-600">
                {loadError || "Could not render this PDF."}
              </div>
            }
            className="flex justify-center"
          >
            <div
              className={`flex items-start justify-center ${
                viewMode === "double" ? "flex-row gap-4" : "flex-col gap-4"
              }`}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer
                renderAnnotationLayer
                scale={scale}
                width={pageWidth}
                className="bg-surface"
              />
              {viewMode === "double" && pageNumber + 1 <= (numPages || 0) ? (
                <Page
                  pageNumber={pageNumber + 1}
                  renderTextLayer
                  renderAnnotationLayer
                  scale={scale}
                  width={pageWidth}
                  className="bg-surface"
                />
              ) : null}
            </div>
          </Document>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-black/10 bg-surface/90 px-3 py-2 text-[11px] text-muted shadow transition-opacity sm:bottom-4 sm:px-4 sm:text-xs ${
          showPanel || chromeVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ color: shellColor }}
      >
        {viewMode === "double" ? "Spread" : "Single"} | Page {pageNumber} /{" "}
        {numPages || "--"}
      </div>
    </div>
  );
}
