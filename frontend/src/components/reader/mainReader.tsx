import React, { useEffect, useMemo, useRef, useState } from "react";
import EpubReader from "./epubReader";
import PdfReader from "./pdfReader";
import TextReader from "./textReader";
import type { MainReaderProps } from "../../types/readerBackendTypes";
import { useReaderSession } from "../../hooks/reader/useReaderSession";

export default function Reader({ book, onSelection }: MainReaderProps) {
  const {
    isBootstrapping,
    manifest,
    session,
    annotations,
    readerLocation,
    currentTextSection,
    loadedTextSections,
    isTextFormat,
    usesSectionReader,
    reportLocation,
    setCurrentTextSection,
    createBookmark,
    updateAnnotation,
    deleteAnnotation,
    jumpToAnnotation,
  } = useReaderSession(book);

  const [chromeVisible, setChromeVisible] = useState(true);
  const hideChromeTimeoutRef = useRef<number | null>(null);

  const handleSelection = (text?: string) => {
    if (text && text.length > 0 && onSelection) {
      onSelection(text);
    }
  };

  const activeTextSection = useMemo(() => {
    return loadedTextSections[currentTextSection] || null;
  }, [currentTextSection, loadedTextSections]);

  const revealChrome = () => {
    setChromeVisible(true);
    if (hideChromeTimeoutRef.current) {
      window.clearTimeout(hideChromeTimeoutRef.current);
    }
    hideChromeTimeoutRef.current = window.setTimeout(() => {
      setChromeVisible(false);
    }, 1500);
  };

  useEffect(() => {
    setChromeVisible(true);
    if (hideChromeTimeoutRef.current) {
      window.clearTimeout(hideChromeTimeoutRef.current);
    }
    hideChromeTimeoutRef.current = window.setTimeout(() => {
      setChromeVisible(false);
    }, 1500);
  }, [book?.filename]);

  useEffect(() => {
    const handleActivity = () => revealChrome();

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hideChromeTimeoutRef.current) {
        window.clearTimeout(hideChromeTimeoutRef.current);
      }
    };
  }, []);

  if (!book) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 animate-pulse">
        Loading Book...
      </div>
    );
  }

  const ext = String(book.extension || "txt")
    .toLowerCase()
    .replace(/^\./, "");

  const centeredShellClass =
    ext === "pdf"
      ? "mx-auto h-full w-full max-w-[1560px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
      : "mx-auto h-full w-full max-w-[1280px] overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]";

  const renderCenteredSurface = (children: React.ReactNode) => (
    <div
      className="h-full w-full bg-[#050505] px-3 py-3 sm:px-5 sm:py-5 md:px-7 md:py-7"
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
      <div className={centeredShellClass}>{children}</div>
    </div>
  );

  if (ext === "epub" && !usesSectionReader) {
    return renderCenteredSurface(
      <div className="h-full w-full relative cursor-default">
        <EpubReader
          book={book}
          initialLocation={readerLocation}
          onSaveLocation={reportLocation}
          onSelection={handleSelection}
          chromeVisible={chromeVisible}
          onActivity={revealChrome}
          annotations={annotations}
          onAddBookmark={() => void createBookmark()}
          onUpdateAnnotation={updateAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onJumpToAnnotation={jumpToAnnotation}
        />
      </div>,
    );
  }

  if (ext === "pdf") {
    return renderCenteredSurface(
      <div className="h-full w-full relative cursor-default">
        <PdfReader
          book={book}
          initialLocation={readerLocation}
          onSaveLocation={reportLocation}
          onSelection={handleSelection}
          chromeVisible={chromeVisible}
          toc={manifest?.toc || []}
          annotations={annotations}
          onAddBookmark={() => void createBookmark()}
          onUpdateAnnotation={updateAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onJumpToAnnotation={jumpToAnnotation}
        />
      </div>,
    );
  }

  return renderCenteredSurface(
    <div className="h-full w-full relative cursor-default">
      <TextReader
        book={book}
        content={activeTextSection?.content || ""}
        initialLocation={readerLocation}
        onSaveLocation={reportLocation}
        onSelection={handleSelection}
        currentSectionIndex={currentTextSection}
        sectionCount={manifest?.section_index?.length || 0}
        sections={manifest?.section_index || []}
        toc={manifest?.toc || []}
        sectionLabel={
          activeTextSection?.label ||
          manifest?.section_index?.[currentTextSection]?.label ||
          ""
        }
        initialPageIndex={Number(session?.view_state?.pageIndex || 0)}
        onNavigateSection={(nextSection) =>
          setCurrentTextSection(
            Math.min(
              Math.max(0, nextSection),
              Math.max((manifest?.section_index?.length || 1) - 1, 0),
            ),
          )
        }
        isLoadingSection={
          isBootstrapping ||
          manifest?.status === "building" ||
          (usesSectionReader &&
            !!manifest?.section_index?.length &&
            !activeTextSection)
        }
        chromeVisible={chromeVisible}
        annotations={annotations}
        onAddBookmark={() => void createBookmark()}
        onUpdateAnnotation={updateAnnotation}
        onDeleteAnnotation={deleteAnnotation}
        onJumpToAnnotation={jumpToAnnotation}
      />
    </div>,
  );
}
