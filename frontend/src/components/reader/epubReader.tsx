import React, { useState } from "react";
import { EpubView } from "react-reader";
import { useEpubControl } from "../../hooks/reader/useEpubControl";
import type { ReaderAnnotation, ReaderProps } from "../../types/readerBackendTypes";
import {
  IconList,
  IconLineHeight,
  IconPanelClose,
  IconSettings,
} from "./readerIcons";
import ReaderAnnotationPanel from "./ReaderAnnotationPanel";
import ReaderPanelSection from "./ReaderPanelSection";
import useIsMobile from "../../hooks/appTools/useIsMobile";

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

interface EpubReaderComponentProps extends ReaderProps {
  chromeVisible: boolean;
  onActivity: () => void;
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

export default function EpubReader({
  book,
  initialLocation,
  onSaveLocation,
  onSelection,
  chromeVisible,
  onActivity,
  annotations,
  onAddBookmark,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onJumpToAnnotation,
}: EpubReaderComponentProps) {
  const isMobile = useIsMobile();
  const {
    settings,
    updateSetting,
    toc,
    navigateTo,
    prevPage,
    nextPage,
    handleTocChange,
    handleLocationChanged,
    getRendition,
    epubOptions,
    getContainerBg,
  } = useEpubControl(initialLocation, onSaveLocation, onSelection, onActivity);

  const [showPanel, setShowPanel] = useState(false);
  const isPaginated = settings.flow === "paginated";
  const readerMaxWidth =
    isMobile
      ? "100%"
      : isPaginated
      ? settings.spread === "always"
        ? "1320px"
        : "860px"
      : "1180px";

  return (
    <div
      style={{
        height: "100%",
        position: "relative",
        backgroundColor: getContainerBg(),
        transition: "background-color 0.2s ease",
      }}
      className="flex flex-col"
    >
      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className={`absolute right-3 top-3 z-50 rounded-xl border border-black/10 p-3 shadow-lg transition-all sm:right-4 sm:top-4 ${
          showPanel || chromeVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        } ${showPanel ? "bg-primary text-white" : "bg-surface text-primary hover:bg-canvas"}`}
        title="Reader controls"
      >
        <IconSettings />
      </button>

      {showPanel ? (
        <aside className="absolute inset-x-3 top-16 bottom-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-surface shadow-2xl sm:inset-x-auto sm:right-20 sm:top-4 sm:bottom-4 sm:w-[360px]">
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              <div className="max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-surface p-2">
                {toc.length === 0 ? (
                  <div className="p-3 text-sm text-muted">
                    No table of contents available.
                  </div>
                ) : (
                  toc.map((item, index) => (
                    <button
                      key={`${item.href}-${index}`}
                      onClick={() => navigateTo(item.href)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-primary hover:bg-canvas"
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    updateSetting("flow", "scrolled");
                    updateSetting("spread", "none");
                  }}
                  className={`rounded-xl border px-3 py-3 text-xs font-medium ${
                    settings.flow === "scrolled"
                      ? "border-primary bg-primary text-white"
                      : "border-black/10 bg-surface text-primary"
                  }`}
                >
                  Scroll
                </button>
                <button
                  onClick={() => {
                    updateSetting("flow", "paginated");
                    updateSetting("spread", "none");
                  }}
                  className={`rounded-xl border px-3 py-3 text-xs font-medium ${
                    settings.flow === "paginated" && settings.spread === "none"
                      ? "border-primary bg-primary text-white"
                      : "border-black/10 bg-surface text-primary"
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => {
                    updateSetting("flow", "paginated");
                    updateSetting("spread", "always");
                  }}
                  className={`rounded-xl border px-3 py-3 text-xs font-medium ${
                    settings.flow === "paginated" && settings.spread === "always"
                      ? "border-primary bg-primary text-white"
                      : "border-black/10 bg-surface text-primary"
                  }`}
                >
                  Spread
                </button>
              </div>

              <select
                value={settings.fontFamily}
                onChange={(event) =>
                  updateSetting("fontFamily", event.target.value)
                }
                className="mt-3 w-full rounded-xl border border-black/10 bg-surface px-3 py-3 text-sm text-primary outline-none"
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="mt-3 rounded-xl border border-black/10 bg-surface p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted">
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

              <div className="mt-3 rounded-xl border border-black/10 bg-surface p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted">
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

              <div className="mt-3 rounded-xl border border-black/10 bg-surface p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted">
                  <span>Narrow</span>
                  <span>{isPaginated ? "Auto" : `${settings.pageMargin}%`}</span>
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
                  disabled={isPaginated}
                  className="w-full accent-black disabled:cursor-not-allowed disabled:opacity-40"
                />
                {isPaginated ? (
                  <div className="mt-2 text-xs text-muted">
                    Single and spread use a fixed page width for stable pagination.
                  </div>
                ) : null}
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

      {settings.flow === "paginated" ? (
        <>
          <button
            onClick={prevPage}
            className="absolute left-0 top-0 bottom-0 z-30 w-[10%] cursor-w-resize bg-transparent"
            title="Previous page"
          />
          <button
            onClick={nextPage}
            className="absolute right-0 top-0 bottom-0 z-30 w-[10%] cursor-e-resize bg-transparent"
            title="Next page"
          />
        </>
      ) : null}

      <div className="flex-1 w-full h-full relative overflow-hidden">
        <div
          className="mx-auto h-full w-full"
          style={{
            maxWidth: readerMaxWidth,
            boxSizing: "border-box",
            paddingLeft: isPaginated ? "0" : isMobile ? "12px" : "24px",
            paddingRight: isPaginated ? "0" : isMobile ? "12px" : "24px",
          }}
        >
          <EpubView
            key={`${settings.flow}-${settings.spread}-${settings.pageMargin}`}
            url={book.url}
            location={initialLocation}
            tocChanged={handleTocChange}
            locationChanged={handleLocationChanged}
            getRendition={getRendition}
            epubOptions={epubOptions}
          />
        </div>
      </div>
    </div>
  );
}
