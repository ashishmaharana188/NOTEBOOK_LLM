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
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

  const handleMouseUp = () => {
    if (!onSelection) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (text.length > 0) {
      onSelection(text);
    }
  };

  const pageWidth = useMemo(() => {
    if (viewMode === "double") {
      return 460;
    }
    return 920;
  }, [viewMode]);

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
        className={`absolute right-4 top-4 z-50 rounded-xl border border-black/10 p-3 shadow-lg transition-all ${
          showPanel || chromeVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        } ${showPanel ? "bg-primary text-white" : "bg-surface text-primary hover:bg-canvas"}`}
        title="Reader controls"
      >
        <IconSettings />
      </button>

      {showPanel ? (
        <aside className="absolute right-20 top-4 bottom-4 z-40 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-primary">
                Reader Controls
              </div>
              <div className="text-xs text-muted">{book.title}</div>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="rounded-lg border border-black/10 p-2 text-primary hover:bg-canvas"
              title="Close controls"
            >
              <IconPanelClose />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => changePage(viewMode === "double" ? -2 : -1)}
                  disabled={pageNumber <= 1}
                  className="rounded-xl border border-black/10 bg-surface px-3 py-3 text-sm text-primary disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => changePage(viewMode === "double" ? 2 : 1)}
                  disabled={pageNumber >= (numPages || 9999)}
                  className="rounded-xl border border-black/10 bg-surface px-3 py-3 text-sm text-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
              <div className="mt-2 rounded-xl border border-black/10 bg-surface px-4 py-3 text-sm text-muted">
                Page {pageNumber} of {numPages || "--"}
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <div className="rounded-xl border border-black/10 bg-surface p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted">
                  <button
                    onClick={zoomOut}
                    className="rounded-lg border border-black/10 p-2 text-primary hover:bg-canvas"
                    title="Zoom out"
                  >
                    <IconMinus />
                  </button>
                  <span>{Math.round(scale * 100)}%</span>
                  <button
                    onClick={zoomIn}
                    className="rounded-lg border border-black/10 p-2 text-primary hover:bg-canvas"
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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => viewMode === "double" && toggleViewMode()}
                  className={`rounded-xl border px-3 py-3 text-sm ${
                    viewMode === "single"
                      ? "border-primary bg-primary text-white"
                      : "border-black/10 bg-surface text-primary"
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => viewMode === "single" && toggleViewMode()}
                  className={`rounded-xl border px-3 py-3 text-sm ${
                    viewMode === "double"
                      ? "border-primary bg-primary text-white"
                      : "border-black/10 bg-surface text-primary"
                  }`}
                >
                  Spread
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-black/10 bg-surface p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted">
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

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  onClick={() => updateSetting("theme", "light")}
                  className={`rounded-xl border px-3 py-4 text-sm ${
                    settings.theme === "light"
                      ? "border-primary ring-2 ring-primary/15"
                      : "border-black/10"
                  } bg-white text-black`}
                >
                  Aa
                </button>
                <button
                  onClick={() => updateSetting("theme", "sepia")}
                  className={`rounded-xl border px-3 py-4 text-sm ${
                    settings.theme === "sepia"
                      ? "border-primary ring-2 ring-primary/15"
                      : "border-black/10"
                  } bg-[#f8f1e3] text-[#5b4636]`}
                >
                  Aa
                </button>
                <button
                  onClick={() => updateSetting("theme", "dark")}
                  className={`rounded-xl border px-3 py-4 text-sm ${
                    settings.theme === "dark"
                      ? "border-primary ring-2 ring-primary/15"
                      : "border-black/10"
                  } bg-[#111827] text-white`}
                >
                  Aa
                </button>
              </div>
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
        onMouseUp={handleMouseUp}
      >
        <div
          className="mx-auto flex min-h-full max-w-[1680px] items-center justify-center px-6 py-10"
          style={{
            paddingLeft: `${settings.pageMargin}%`,
            paddingRight: `${settings.pageMargin}%`,
          }}
        >
          <Document
            file={book.url}
            onLoadSuccess={({ numPages: loadedNumPages }) =>
              setNumPages(loadedNumPages)
            }
            onLoadError={(error) => console.error("PDF Error:", error)}
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
        className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-black/10 bg-surface/90 px-4 py-2 text-xs text-muted shadow transition-opacity ${
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
