import React, { useEffect, useMemo, useRef, useState } from "react";
import { splitIntoFocusBlocks } from "./focusBlockUtils";

interface FocusBlockReaderProps {
  text: string;
  title?: string;
  subtitle?: string;
  className?: string;
  containerClassName?: string;
  paperClassName?: string;
  textClassName?: string;
  topMeta?: React.ReactNode;
  onSelection?: (text: string) => void;
  onReachedEnd?: () => void;
  onActiveBlockChange?: (index: number) => void;
  scrollEnabled?: boolean;
  onActivate?: () => void;
  fontFamily?: string;
  fontSizePx?: number;
  lineHeight?: number;
}

export default function FocusBlockReader({
  text,
  title = "",
  subtitle = "",
  className = "",
  containerClassName = "",
  paperClassName = "",
  textClassName = "",
  topMeta,
  onSelection,
  onReachedEnd,
  onActiveBlockChange,
  scrollEnabled = true,
  onActivate,
  fontFamily = "Georgia, serif",
  fontSizePx = 20,
  lineHeight = 1.75,
}: FocusBlockReaderProps) {
  const blocks = useMemo(() => splitIntoFocusBlocks(text), [text]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const nearEndTriggeredRef = useRef(false);

  useEffect(() => {
    setActiveBlockIndex(0);
    nearEndTriggeredRef.current = false;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [text]);

  useEffect(() => {
    onActiveBlockChange?.(activeBlockIndex);
  }, [activeBlockIndex, onActiveBlockChange]);

  const updateActiveBlock = () => {
    const container = scrollRef.current;
    if (!container || !blocks.length) return;

    const containerRect = container.getBoundingClientRect();
    const focusLine = containerRect.top + containerRect.height * 0.34;
    let nextIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    blockRefs.current.forEach((node, index) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const distance = Math.abs(center - focusLine);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextIndex = index;
      }
    });

    setActiveBlockIndex(nextIndex);

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

  useEffect(() => {
    updateActiveBlock();
  }, [text]);

  const handleSelectionCapture = () => {
    if (!scrollEnabled || !onSelection || !scrollRef.current) return;
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
        onScroll={updateActiveBlock}
        onMouseDown={onActivate}
        onPointerDown={onActivate}
        onMouseUp={handleSelectionCapture}
        onTouchEnd={handleSelectionCapture}
        className={`min-h-0 flex-1 ${scrollEnabled ? "overflow-y-auto custom-scrollbar" : "overflow-hidden"} ${containerClassName}`}
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

          <div className="space-y-10">
            {blocks.map((block, index) => {
              const distance = Math.abs(index - activeBlockIndex);
              const isActive = distance === 0;
              const opacity =
                distance === 0 ? 1 : distance === 1 ? 0.8 : distance === 2 ? 0.58 : 0.34;
              const scale = distance === 0 ? 1 : distance === 1 ? 0.985 : 0.97;

              return (
                <div
                  key={block.id}
                  ref={(node) => {
                    blockRefs.current[index] = node;
                  }}
                  className="transition-all duration-300 ease-out"
                  style={{
                    opacity,
                    transform: `scale(${scale})`,
                    filter: isActive ? "none" : "blur(0px)",
                  }}
                >
                  <p
                    className={`whitespace-pre-wrap select-text text-slate-900 selection:bg-[#f3dd73] selection:text-slate-900 ${textClassName}`}
                    style={{
                      fontFamily,
                      fontSize: `${fontSizePx}px`,
                      lineHeight,
                    }}
                  >
                    {block.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
