import React, { useEffect, useRef } from "react";

interface RichDocumentReaderProps {
  html: string;
  title?: string;
  subtitle?: string;
  className?: string;
  containerClassName?: string;
  paperClassName?: string;
  topMeta?: React.ReactNode;
  onSelection?: (text: string) => void;
  onReachedEnd?: () => void;
}

export default function RichDocumentReader({
  html,
  title = "",
  subtitle = "",
  className = "",
  containerClassName = "",
  paperClassName = "",
  topMeta,
  onSelection,
  onReachedEnd,
}: RichDocumentReaderProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearEndTriggeredRef = useRef(false);

  useEffect(() => {
    nearEndTriggeredRef.current = false;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [html]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    const remaining =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (remaining < 180) {
      if (!nearEndTriggeredRef.current) {
        nearEndTriggeredRef.current = true;
        onReachedEnd?.();
      }
    } else {
      nearEndTriggeredRef.current = false;
    }
  };

  const handleSelectionCapture = () => {
    if (!onSelection || !scrollRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const textSelection = selection.toString().trim();
    if (!textSelection) return;

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (
      (anchorNode && !scrollRef.current.contains(anchorNode)) ||
      (focusNode && !scrollRef.current.contains(focusNode))
    ) {
      return;
    }

    onSelection(textSelection);
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseUp={handleSelectionCapture}
        onTouchEnd={handleSelectionCapture}
        className={`min-h-0 flex-1 overflow-y-auto custom-scrollbar ${containerClassName}`}
      >
        <div
          className={`mx-auto flex min-h-full w-full max-w-[860px] flex-col px-6 pb-28 pt-12 sm:px-10 md:px-14 ${paperClassName}`}
        >
          {(title || subtitle || topMeta) && (
            <header className="mb-10 border-b border-black/8 pb-8">
              {subtitle ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {subtitle}
                </div>
              ) : null}
              {title ? (
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900 md:text-4xl">
                  {title}
                </h2>
              ) : null}
              {topMeta ? <div className="mt-4">{topMeta}</div> : null}
            </header>
          )}

          <article
            className="prose prose-lg max-w-none text-slate-900 selection:bg-[#f3dd73] selection:text-slate-900 prose-headings:tracking-[-0.03em] prose-headings:text-slate-900 prose-p:leading-8 prose-li:leading-8 prose-blockquote:border-l-black/20 prose-blockquote:text-slate-700 [&_img]:my-8 [&_img]:h-auto [&_img]:w-full [&_img]:max-w-3xl [&_img]:rounded-sm [&_img]:border [&_img]:border-black/10 [&_img]:object-contain [&_video]:my-8 [&_video]:w-full [&_video]:max-w-3xl [&_iframe]:my-8 [&_iframe]:min-h-[360px] [&_iframe]:w-full [&_pre]:overflow-x-auto [&_pre]:rounded-none [&_pre]:border [&_pre]:border-black/10 [&_pre]:bg-slate-950 [&_pre]:p-4"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
