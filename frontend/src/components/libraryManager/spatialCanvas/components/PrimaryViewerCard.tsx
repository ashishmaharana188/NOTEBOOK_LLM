import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  DocumentTextIcon,
  PlusIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";

import ScrubRuler from "./ScrubRuler";
import VideoSlidePlayer from "../media/VideoSlidePlayer";
import UniversalCoverMedia from "../media/UniversalCoverMedia";
import { parseToSlides } from "../utils/slideParser";

const PrimaryViewerCard = ({
  activeNode,
  isExpanded,
  canvasScale,
  sizeOffset,
  setSizeOffset,
  onAddSticky,
  totalItems,
  pageIndex,
  setPageIndex,
  direction,
  onAddQuickThought,
  globalNotes,
  onFocusNote,
}: any) => {
  const [radiusOffset, setRadiusOffset] = useState(0);
  const dragRef = useRef<{
    type: "size" | "radius" | null;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startR: number;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startR: 0,
  });

  const cardRef = useRef<HTMLDivElement>(null);

  const rawContent = activeNode?.text || activeNode?.content || "";
  const slides = useMemo(() => parseToSlides(rawContent), [rawContent]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isReadLocked, setIsReadLocked] = useState(false);
  const isNoteNode = Boolean(activeNode?.note_id || activeNode?.type === "note");
  const focusLabel = isNoteNode ? "Focus Note" : "Full Context";

  // --- DRAG TO SCROLL ENGINE ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollState = useRef({
    isDragging: false,
    startY: 0,
    scrollTop: 0,
  });

  const onScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isReadLocked) return;
    e.stopPropagation();
    scrollState.current.isDragging = true;
    scrollState.current.startY = e.pageY - e.currentTarget.offsetTop;
    scrollState.current.scrollTop = e.currentTarget.scrollTop;
  };

  const onScrollPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isReadLocked || !scrollState.current.isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const y = e.pageY - e.currentTarget.offsetTop;
    const walk = (y - scrollState.current.startY) * 1.5;
    e.currentTarget.scrollTop = scrollState.current.scrollTop - walk;
  };

  const onScrollPointerUpOrLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isReadLocked) return;
    e.stopPropagation();
    scrollState.current.isDragging = false;
  };

  useEffect(() => {
    setSlideIndex(0);
    setIsReadLocked(false);
  }, [activeNode]);

  useEffect(() => {
    setIsReadLocked(false);
  }, [slideIndex]);

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    if (info.offset.x < -threshold && slideIndex < slides.length - 1) {
      setSlideIndex((s) => s + 1);
    } else if (info.offset.x > threshold && slideIndex > 0) {
      setSlideIndex((s) => s - 1);
    }
  };

  useEffect(() => {
    let latestW = sizeOffset.w;
    let latestH = sizeOffset.h;
    let latestR = radiusOffset;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.type || !cardRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const deltaX = (e.clientX - dragRef.current.startX) / canvasScale;
      const deltaY = (e.clientY - dragRef.current.startY) / canvasScale;

      if (dragRef.current.type === "size") {
        latestW = dragRef.current.startW + deltaX;
        latestH = dragRef.current.startH + deltaY;
        latestW = Math.max(-20, Math.min(100, latestW));
        latestH = Math.max(-20, Math.min(100, latestH));

        // DIRECT DOM MUTATION (Zero React Renders!)
        cardRef.current.style.width = `${500 + latestW}px`;
        cardRef.current.style.height = `${700 + latestH}px`;
      } else if (dragRef.current.type === "radius") {
        latestR = dragRef.current.startR + deltaX;
        latestR = Math.max(-28, Math.min(28, latestR));

        // DIRECT DOM MUTATION
        cardRef.current.style.borderRadius = `${32 + latestR}px`;
      }
    };

    const handleMouseUp = () => {
      if (dragRef.current.type) {
        // Sync to React State ONLY when dragging stops
        if (dragRef.current.type === "size")
          setSizeOffset({ w: latestW, h: latestH });
        if (dragRef.current.type === "radius") setRadiusOffset(latestR);
        dragRef.current.type = null;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [canvasScale, sizeOffset, radiusOffset, setSizeOffset]);

  const startDrag = (e: React.MouseEvent, type: "size" | "radius") => {
    e.stopPropagation();
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startW: sizeOffset.w,
      startH: sizeOffset.h,
      startR: radiusOffset,
    };
  };

  if (!isExpanded) return null;

  const baseW = 500;
  const baseH = 700;
  const finalWidth = baseW + sizeOffset.w;
  const finalHeight = baseH + sizeOffset.h;
  const finalRadius = 32 + radiusOffset;
  const currentSlide = slides[slideIndex] || null;

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="absolute top-0 left-0 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] border border-slate-200 flex flex-col z-[4000] group no-pan"
      style={{
        transformOrigin: "center center",
        x: -finalWidth / 2,
        y: -finalHeight / 2,
        width: finalWidth,
        height: finalHeight,
        borderRadius: `${finalRadius}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* THE FIX: THE INNER CLIPPING MASK */}
      {/* This perfectly rounds the corners of the content, but lets the Ruler sit outside! */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {!activeNode ? (
          <div className="absolute inset-0 bg-slate-900 rounded-[inherit] flex items-center justify-center">
            <span className="text-slate-500 animate-pulse text-xs font-bold uppercase tracking-widest">
              Loading...
            </span>
          </div>
        ) : activeNode.relation === "Stack" ||
          activeNode.relation === "Cluster" ? (
          <div
            className="absolute inset-0 bg-slate-900 pointer-events-auto rounded-[inherit] overflow-hidden flex flex-col items-center justify-center no-pan"
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            {activeNode.cover_image || activeNode.cover_media ? (
              <UniversalCoverMedia
                url={activeNode.cover_image || activeNode.cover_media}
              />
            ) : (
              <div className="absolute inset-0 border-[4px] border-slate-700 m-8 rounded-3xl flex items-center justify-center border-dashed">
                <span className="text-white/20 font-bold tracking-[0.3em] text-3xl uppercase text-center px-4">
                  Cover
                  <br />
                  Not Set
                </span>
              </div>
            )}
            <div className="relative z-10 mt-auto pb-24 flex flex-col items-center w-full"></div>
          </div>
        ) : activeNode.relation === "Folder" ? (
          <div
            className="absolute inset-0 bg-white pointer-events-auto rounded-[inherit] p-10 pt-28 flex flex-col no-pan"
            onWheelCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <ul className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6 pr-4">
              {globalNotes
                ?.filter(
                  (n: any) =>
                    String(n.group_id) === String(activeNode.group_id),
                )
                .slice(0, 5)
                .map((note: any, idx: number) => (
                  <li key={idx}>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-700 text-lg leading-snug">
                        {note.title || "Untitled Note"}
                      </h4>
                      <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">
                        {note.content?.replace(/<[^>]*>?/gm, "") ||
                          "No content available."}
                      </p>
                    </div>
                  </li>
                ))}
              {(!globalNotes ||
                globalNotes.filter(
                  (n: any) =>
                    String(n.group_id) === String(activeNode.group_id),
                ).length === 0) && (
                <li className="text-slate-400 italic text-center py-10">
                  This folder is empty.
                </li>
              )}
              {globalNotes?.filter(
                (n: any) => String(n.group_id) === String(activeNode.group_id),
              ).length > 5 && (
                <li className="py-4 text-center text-xs font-bold text-blue-500 bg-blue-50 rounded-xl uppercase tracking-widest mt-auto shrink-0 shadow-sm">
                  +{" "}
                  {globalNotes.filter(
                    (n: any) =>
                      String(n.group_id) === String(activeNode.group_id),
                  ).length - 5}{" "}
                  More Notes inside
                </li>
              )}
            </ul>
          </div>
        ) : (
          <>
            {/* THE FLOATING HEADER */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start shrink-0 z-[5000] pointer-events-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onFocusNote && activeNode) {
                    onFocusNote(activeNode);
                  }
                }}
                className="text-xs font-bold text-blue-600 bg-white/90 hover:bg-blue-50 active:scale-95   px-3 py-1.5 rounded-lg shadow-sm uppercase tracking-widest flex items-center gap-2 pointer-events-auto transition-all"
              >
                <DocumentTextIcon className="w-4 h-4" /> {focusLabel}
              </button>
              <div className="flex flex-col items-end gap-2 pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddQuickThought) onAddQuickThought();
                  }}
                  className="px-3 py-1.5 bg-pink-100/90   text-pink-700 hover:bg-pink-200 border border-pink-200 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 shadow-sm"
                >
                  <PlusIcon className="w-3 h-3" /> Quick Thought
                </button>
              </div>
            </div>

            {/* THE SWIPEABLE INNER CANVAS FOR NOTES/ECHOES */}
            <motion.div
              drag={!isReadLocked ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className={`absolute inset-0 z-10 ${!isReadLocked ? "cursor-grab active:cursor-grabbing" : ""} no-pan`}
            >
              {currentSlide ? (
                <>
                  {(currentSlide.type === "text" ||
                    currentSlide.type === "code") && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[6000]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsReadLocked(!isReadLocked);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center gap-2 border pointer-events-auto ${
                          isReadLocked
                            ? "bg-yellow-300 text-black border-green-400"
                            : "bg-slate-800/80 text-white border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        {isReadLocked ? (
                          <>
                            <LockClosedIcon className="w-3 h-3" /> Scroll Locked
                          </>
                        ) : (
                          <>
                            <LockOpenIcon className="w-3 h-3" /> Lock to Scroll
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {currentSlide.type === "image" && (
                    <img
                      src={currentSlide.src}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  )}
                  {currentSlide.type === "video" && (
                    <VideoSlidePlayer
                      src={currentSlide.src}
                      isVideo={currentSlide.isVideo}
                    />
                  )}
                  {currentSlide.type === "audio" && (
                    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center pointer-events-auto gap-6 rounded-[inherit]">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)] pointer-events-none" />
                        <span className="text-white font-black tracking-[0.2em] text-3xl uppercase pointer-events-none">
                          .REC
                        </span>
                      </div>
                      {currentSlide.src && (
                        <audio
                          src={currentSlide.src}
                          controls
                          className="w-64 z-50 pointer-events-auto"
                        />
                      )}
                    </div>
                  )}

                  {currentSlide.type === "code" && (
                    <div
                      ref={scrollContainerRef}
                      className={`no-pan w-full h-full bg-[#0d1117] text-slate-100 p-8 pt-40 transition-all duration-300 rounded-[inherit] [&::-webkit-scrollbar]:hidden flex flex-col ${
                        isReadLocked
                          ? "overflow-y-auto pointer-events-auto cursor-grab active:cursor-grabbing"
                          : "overflow-hidden pointer-events-none"
                      }`}
                      style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        touchAction: isReadLocked ? "pan-y" : "none",
                        WebkitOverflowScrolling: "touch",
                      }}
                      onPointerDown={onScrollPointerDown}
                      onPointerMove={onScrollPointerMove}
                      onPointerUp={onScrollPointerUpOrLeave}
                      onPointerLeave={onScrollPointerUpOrLeave}
                      onWheelCapture={(e) => e.stopPropagation()}
                      onTouchStartCapture={(e) => e.stopPropagation()}
                    >
                      <div
                        className="flex-1 w-full text-sm font-mono leading-relaxed pb-20 [&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:!p-0 pointer-events-none"
                        dangerouslySetInnerHTML={{ __html: currentSlide.html }}
                      />
                    </div>
                  )}

                  {currentSlide.type === "text" && (
                    <div
                      ref={scrollContainerRef}
                      className={`no-pan w-full h-full p-10 pt-40 bg-white transition-all duration-300 rounded-[inherit] [&::-webkit-scrollbar]:hidden ${
                        isReadLocked
                          ? "overflow-y-auto pointer-events-auto cursor-grab active:cursor-grabbing"
                          : "overflow-hidden pointer-events-none"
                      }`}
                      style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        touchAction: isReadLocked ? "pan-y" : "none",
                        WebkitOverflowScrolling: "touch",
                      }}
                      onPointerDown={onScrollPointerDown}
                      onPointerMove={onScrollPointerMove}
                      onPointerUp={onScrollPointerUpOrLeave}
                      onPointerLeave={onScrollPointerUpOrLeave}
                      onWheelCapture={(e) => e.stopPropagation()}
                      onTouchStartCapture={(e) => e.stopPropagation()}
                    >
                      {currentSlide.html ? (
                        <div
                          className="prose prose-base prose-slate prose-headings:font-bold prose-p:leading-relaxed prose-a:text-blue-600 max-w-none pb-20 pointer-events-none"
                          dangerouslySetInnerHTML={{
                            __html: currentSlide.html,
                          }}
                        />
                      ) : (
                        <p className="text-base text-slate-700 leading-loose font-sans whitespace-pre-wrap pb-20 pointer-events-none">
                          {currentSlide.content}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-slate-400 opacity-60 pointer-events-none z-10">
                  <DocumentTextIcon className="w-16 h-16 mb-4" />
                  <p className="font-bold uppercase tracking-widest text-sm">
                    Select a card to view
                  </p>
                </div>
              )}
            </motion.div>

            {slides.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-[5000] pointer-events-none">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${i === slideIndex ? "bg-blue-500 w-4" : "bg-slate-300/80   shadow-sm"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {/* --- END OF CLIPPING MASK --- */}

      {/* Drag Handles (Sitting safely outside the mask) */}
      <div
        className="no-pan-resize absolute bottom-0 right-0 z-[6000] flex h-10 w-10 cursor-nwse-resize items-end justify-end p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        onMouseDown={(e) => startDrag(e, "size")}
      >
        <div className="w-4 h-4 border-r-4 border-b-4 border-slate-300/50   rounded-br-sm pointer-events-none" />
      </div>

      <div
        className="no-pan-resize absolute top-0 right-0 z-[6000] flex h-10 w-10 cursor-nesw-resize items-start justify-end p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
        onMouseDown={(e) => startDrag(e, "radius")}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-slate-300/50   pointer-events-none" />
      </div>

      {isExpanded && (
        <ScrubRuler
          direction={direction}
          totalItems={totalItems}
          pageIndex={pageIndex}
          setPageIndex={setPageIndex}
        />
      )}
    </motion.div>
  );
};

export default PrimaryViewerCard;
