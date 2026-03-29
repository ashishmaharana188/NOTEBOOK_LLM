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

  if (ext === "epub" && !usesSectionReader) {
    return (
      <div
        className="h-full w-full relative cursor-default"
        onMouseMove={revealChrome}
        onTouchStart={revealChrome}
      >
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
      </div>
    );
  }

  if (ext === "pdf") {
    return (
      <div
        className="h-full w-full relative cursor-default"
        onMouseMove={revealChrome}
        onTouchStart={revealChrome}
      >
        <PdfReader
          book={book}
          initialLocation={readerLocation}
          onSaveLocation={reportLocation}
          onSelection={handleSelection}
          chromeVisible={chromeVisible}
          annotations={annotations}
          onAddBookmark={() => void createBookmark()}
          onUpdateAnnotation={updateAnnotation}
          onDeleteAnnotation={deleteAnnotation}
          onJumpToAnnotation={jumpToAnnotation}
        />
      </div>
    );
  }

  return (
    <div
      className="h-full w-full relative cursor-default"
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
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
    </div>
  );
}
