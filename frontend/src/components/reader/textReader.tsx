import React, { useEffect, useRef, useState } from "react";
import type {
  ReaderAnnotation,
  ReaderBook,
  ReaderLocationPayload,
} from "../../types/readerBackendTypes";
import { useReaderSetting } from "../../hooks/reader/useReaderSetting";
import {
  IconLineHeight,
  IconPanelClose,
  IconSettings,
} from "./readerIcons";
import ReaderAnnotationPanel from "./ReaderAnnotationPanel";
import ReaderPanelSection from "./ReaderPanelSection";

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

interface TextReaderProps {
  book: ReaderBook | null;
  content: string;
  initialLocation: string | number | null;
  onSaveLocation: (payload: ReaderLocationPayload) => void;
  onSelection?: (text: string) => void;
  currentSectionIndex: number;
  sectionCount: number;
  sectionLabel: string;
  onNavigateSection: (sectionIndex: number) => void;
  isLoadingSection?: boolean;
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

export default function TextReader({
  book,
  content,
  initialLocation,
  onSaveLocation,
  onSelection,
  currentSectionIndex,
  sectionCount,
  sectionLabel,
  onNavigateSection,
  isLoadingSection = false,
  chromeVisible,
  annotations,
  onAddBookmark,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onJumpToAnnotation,
}: TextReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings, updateSetting, themeStyles } = useReaderSetting();
  const [showPanel, setShowPanel] = useState(false);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && onSelection) {
      const text = selection.toString().trim();
      if (text.length > 0) {
        onSelection(text);
      }
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [currentSectionIndex, initialLocation]);

  useEffect(() => {
    onSaveLocation({
      location: currentSectionIndex,
      locationType: "text_section",
      progressPercent:
        sectionCount > 0 ? ((currentSectionIndex + 1) / sectionCount) * 100 : 0,
      pageLabel: sectionLabel || `Section ${currentSectionIndex + 1}`,
      viewState: {},
    });
  }, [currentSectionIndex, onSaveLocation, sectionCount, sectionLabel]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onMouseUp={handleMouseUp}
      style={{
        backgroundColor: themeStyles[settings.theme].body.background,
      }}
    >
      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className={`absolute right-4 top-4 z-50 rounded-xl border border-black/10 p-3 shadow-lg transition-all ${
          showPanel || chromeVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
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
              <div className="text-xs text-muted">{book?.title || "Untitled"}</div>
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

            <ReaderPanelSection title="Contents" defaultOpen>
              <div className="rounded-xl border border-black/10 bg-surface p-4">
                <div className="text-sm font-medium text-primary">
                  {sectionLabel || `Section ${currentSectionIndex + 1}`}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Section {currentSectionIndex + 1} of {Math.max(sectionCount, 1)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onNavigateSection(currentSectionIndex - 1)}
                    disabled={currentSectionIndex <= 0}
                    className="rounded-xl border border-black/10 bg-canvas px-3 py-3 text-sm text-primary disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => onNavigateSection(currentSectionIndex + 1)}
                    disabled={currentSectionIndex >= sectionCount - 1}
                    className="rounded-xl border border-black/10 bg-canvas px-3 py-3 text-sm text-primary disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <select
                value={settings.fontFamily}
                onChange={(event) =>
                  updateSetting("fontFamily", event.target.value)
                }
                className="w-full rounded-xl border border-black/10 bg-surface px-3 py-3 text-sm text-primary outline-none"
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
                  <span>{settings.pageMargin}%</span>
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

      {sectionCount > 1 ? (
        <>
          <button
            onClick={() => onNavigateSection(currentSectionIndex - 1)}
            disabled={currentSectionIndex <= 0}
            className="absolute left-0 top-0 bottom-0 z-30 w-[10%] cursor-w-resize bg-transparent disabled:pointer-events-none"
            title="Previous section"
          />
          <button
            onClick={() => onNavigateSection(currentSectionIndex + 1)}
            disabled={currentSectionIndex >= sectionCount - 1}
            className="absolute right-0 top-0 bottom-0 z-30 w-[10%] cursor-e-resize bg-transparent disabled:pointer-events-none"
            title="Next section"
          />
        </>
      ) : null}

      <div
        ref={containerRef}
        className="h-full overflow-y-auto"
      >
        <div
          className="mx-auto max-w-[1280px] px-8 py-16 md:py-20"
          style={{
            paddingLeft: `${settings.pageMargin}%`,
            paddingRight: `${settings.pageMargin}%`,
          }}
        >
          {isLoadingSection ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-canvas p-8 text-sm text-muted">
              Loading section...
            </div>
          ) : (
            <div
              className="whitespace-pre-wrap"
              style={{
                color: themeStyles[settings.theme].body.color,
                fontFamily: settings.fontFamily,
                lineHeight: settings.lineHeight,
                fontSize: `${Math.max(16, (settings.fontSize / 100) * 18)}px`,
                textAlign: "justify",
                maxWidth: "100%",
              }}
            >
              {content || "No content available."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
