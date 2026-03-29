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

const THEME_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Sepia", value: "sepia" },
  { label: "Dark", value: "dark" },
] as const;

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
      onPointerUp={handleMouseUp}
      style={{
        backgroundColor: themeStyles[settings.theme].body.background,
      }}
    >
      <button
        onClick={() => setShowPanel((prev) => !prev)}
        className={`absolute right-3 top-3 z-50 bg-white px-3 py-2 text-primary shadow-lg transition-all sm:right-4 sm:top-4 ${
          showPanel || chromeVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
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
              <div className="text-xs text-muted">{book?.title || "Untitled"}</div>
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

          <div className="flex-1 overflow-y-auto space-y-5">
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
                <div className="font-medium">
                  {sectionLabel || `Section ${currentSectionIndex + 1}`}
                </div>
                <div className="text-xs text-muted">
                  Section {currentSectionIndex + 1} of {Math.max(sectionCount, 1)}
                </div>
                <div className="flex items-center gap-5 pt-1 text-xs font-medium uppercase tracking-[0.18em]">
                  <button
                    onClick={() => onNavigateSection(currentSectionIndex - 1)}
                    disabled={currentSectionIndex <= 0}
                    className="text-primary disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => onNavigateSection(currentSectionIndex + 1)}
                    disabled={currentSectionIndex >= sectionCount - 1}
                    className="text-primary disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </ReaderPanelSection>

            <ReaderPanelSection title="Layout" icon={<IconLineHeight />}>
              <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                Font
                <select
                  value={settings.fontFamily}
                  onChange={(event) =>
                    updateSetting("fontFamily", event.target.value)
                  }
                  className="mt-2 w-full bg-transparent px-0 py-1 text-sm text-primary outline-none"
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
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
          className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8 sm:py-16 md:py-20"
          style={{
            paddingLeft: `${settings.pageMargin}%`,
            paddingRight: `${settings.pageMargin}%`,
          }}
        >
          {isLoadingSection ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-canvas p-6 text-sm text-muted sm:p-8">
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
