// frontend/src/hooks/reader/usePdfControl.ts
import { useState, useRef, useEffect } from "react";
import type { ReaderLocationPayload } from "../../types/readerBackendTypes";

export function usePdfControl(
  initialLocation: string | number | null,
  onSaveLocation: (payload: ReaderLocationPayload) => void
) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState<number>(1.0);

  // Robust Page Parsing
  const [pageNumber, setPageNumber] = useState<number>(() => {
    const p =
      typeof initialLocation === "string"
        ? parseInt(initialLocation)
        : initialLocation;
    return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 1;
  });

  const currentPageRef = useRef(pageNumber);
  const scaleRef = useRef(scale);

  useEffect(() => {
    currentPageRef.current = pageNumber;
  }, [pageNumber]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const p =
      typeof initialLocation === "string"
        ? parseInt(initialLocation)
        : initialLocation;
    if (Number.isFinite(p) && (p as number) > 0) {
      setPageNumber(p as number);
    }
  }, [initialLocation]);

  // Save on Unmount
  useEffect(() => {
    return () => {
      onSaveLocation({
        location: currentPageRef.current,
        locationType: "pdf_page",
        progressPercent:
          (numPages || 0) > 0
            ? (currentPageRef.current / (numPages || 1)) * 100
            : 0,
        pageLabel: String(currentPageRef.current),
        viewState: {
          scale: scaleRef.current,
        },
      });
    };
  }, [numPages, onSaveLocation]);

  const goToPage = (nextPage: number) => {
    const safePage = Math.min(Math.max(1, nextPage), numPages || 9999);
    setPageNumber(safePage);
    onSaveLocation({
      location: safePage,
      locationType: "pdf_page",
      progressPercent:
        (numPages || 0) > 0 ? (safePage / (numPages || 1)) * 100 : 0,
      pageLabel: String(safePage),
      viewState: {
        scale: scaleRef.current,
      },
    });
  };

  const changePage = (offset: number) => {
    goToPage(pageNumber + offset);
  };

  const zoomIn = () => setScale((s) => Math.min(3.0, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.1));
  const setZoom = (nextScale: number) =>
    setScale(Math.min(3.0, Math.max(0.5, nextScale)));

  return {
    numPages,
    setNumPages,
    pageNumber,
    goToPage,
    changePage,
    scale,
    zoomIn,
    zoomOut,
    setZoom,
  };
}
