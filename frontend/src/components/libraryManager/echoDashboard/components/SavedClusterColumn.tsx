import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  CheckIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronDoubleUpIcon,
  ChevronDoubleDownIcon,
} from "@heroicons/react/24/outline";
import DraggableColumn from "./DraggableColumn";
import InteractiveChunkCard from "./InteractiveChunkCard";

const PAGE_SIZE = 4;

const SavedClusterColumn = React.memo(
  ({
    cluster,
    initialPos, // <--- NEW PROP
    zIndex,
    positions,
    updatePosition,
    zIndexes,
    bringToFront,
    canvasScale,
    handleToggleActive,
    handleSpawnCluster,
    setPendingEchoForNote,
    setViewingEchoNotes,
    refreshGlobalCanvas,
    localLinkedNotes,
    setIsCanvasWheelDisabled,
    handleRenameCluster, // <--- NEW
    handleDeleteCluster,
  }: any) => {
    const [startIndex, setStartIndex] = useState(0);
    const lastScrollTime = useRef(0);
    const pageViewportRef = useRef<HTMLDivElement | null>(null);

    const chunks = cluster.chunks || [];

    // --- THE FIX 1: Filter out Notes ---
    // The backend injects spatial Notes into the cluster chunks.
    // We must strictly remove them here so they don't render in the Echo Dashboard.
    const echoChunksOnly = useMemo(() => {
      return chunks.filter((c: any) => c.type !== "note" && !c.note_id);
    }, [chunks]);

    // REVERSE THE ARRAY: Newest saves appear at the top
    const reversedChunks = useMemo(
      () => [...echoChunksOnly].reverse(),
      [echoChunksOnly],
    );

    // Calculate the maximum possible starting index for pagination
    const maxStartIndex = Math.max(
      0,
      Math.floor((reversedChunks.length - 1) / PAGE_SIZE) * PAGE_SIZE,
    );

    useEffect(() => {
      setStartIndex((prev) => Math.min(prev, maxStartIndex));
    }, [maxStartIndex]);

    useEffect(() => {
      if (pageViewportRef.current) {
        pageViewportRef.current.scrollTop = 0;
      }
    }, [startIndex]);

    // --- WHEEL PAGINATION ENGINE ---
    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.stopPropagation();

        const viewport = pageViewportRef.current;
        if (!viewport) return;

        const hasOverflow = viewport.scrollHeight > viewport.clientHeight + 1;
        if (hasOverflow) {
          const atTop = viewport.scrollTop <= 0;
          const atBottom =
            viewport.scrollTop + viewport.clientHeight >=
            viewport.scrollHeight - 1;

          if (e.deltaY < 0 && !atTop) return;
          if (e.deltaY > 0 && !atBottom) return;
        }

        if (reversedChunks.length <= PAGE_SIZE) return;

        const now = Date.now();
        if (now - lastScrollTime.current < 200) return; // Throttled paging

        if (e.deltaY > 0) {
          if (startIndex < maxStartIndex) {
            e.preventDefault();
            setStartIndex((prev) => Math.min(prev + PAGE_SIZE, maxStartIndex));
            lastScrollTime.current = now;
          }
        } else if (e.deltaY < 0) {
          if (startIndex > 0) {
            e.preventDefault();
            setStartIndex((prev) => Math.max(0, prev - PAGE_SIZE));
            lastScrollTime.current = now;
          }
        }
      },
      [maxStartIndex, reversedChunks.length, startIndex],
    );

    const visibleChunks = reversedChunks.slice(startIndex, startIndex + PAGE_SIZE);
    const totalPages = Math.floor(maxStartIndex / PAGE_SIZE) + 1;
    const currentPage = Math.floor(startIndex / PAGE_SIZE) + 1;

    return (
      <DraggableColumn
        id={cluster.id}
        title={cluster.title}
        author={cluster.is_active ? "Active Workspace" : "Passive Archive"}
        initialPos={initialPos} // <--- Pass the direct value
        zIndex={zIndex}
        onDragEnd={updatePosition}
        bringToFront={bringToFront}
        scale={canvasScale}
        disableScroll={true}
        setIsCanvasWheelDisabled={setIsCanvasWheelDisabled}
        onRename={(newTitle: string) =>
          handleRenameCluster(cluster.id, newTitle)
        } // <--- NEW
        onDelete={() => handleDeleteCluster(cluster.id)}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50 sticky top-0 z-30">
            <button
              onClick={() =>
                handleToggleActive(
                  cluster.id,
                  cluster.book_id,
                  cluster.library_id,
                )
              }
              className={`px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase rounded-sm border transition-colors shadow-sm flex items-center gap-1 ${
                cluster.is_active
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {cluster.is_active && <CheckIcon className="w-3 h-3" />}
              {cluster.is_active ? "Active Target" : "Make Active"}
            </button>
            <button
              onClick={() =>
                handleSpawnCluster(
                  cluster.id,
                  cluster.book_id,
                  cluster.library_id,
                  cluster.title,
                )
              }
              className="px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase bg-white text-slate-600 border border-slate-200 rounded-sm hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-1"
            >
              <PlusIcon className="w-3 h-3" /> Branch
            </button>
          </div>

          <div
            ref={pageViewportRef}
            className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 bg-slate-50/50 flex flex-col gap-0 no-pan"
            onWheel={handleWheel}
          >
            {!chunks || chunks.length === 0 ? (
              <p className="text-xs text-center text-slate-400 italic">
                Empty cluster.
              </p>
            ) : (
              visibleChunks.map((chunk: any, i: number) => {
                const absoluteIndex = startIndex + i;
                return (
                  <InteractiveChunkCard
                    key={`${chunk.chunk_id || chunk.echo_id}-${absoluteIndex}`}
                    chunk={chunk}
                    chunkIndex={absoluteIndex}
                    query={""}
                    activeBookTitle={cluster.title}
                    bookId={cluster.book_id}
                    onNoteClick={(data) => setPendingEchoForNote(data as any)}
                    onManageNotes={(echoId) => setViewingEchoNotes({ echoId })}
                    onSaveSuccess={refreshGlobalCanvas}
                    linkedNoteIds={
                      localLinkedNotes[chunk.echo_id || chunk.chunk_id] || []
                    }
                  />
                );
              })
            )}
          </div>

          {reversedChunks.length > PAGE_SIZE && (
            <div className="flex justify-between items-center gap-2 px-4 py-2 bg-slate-100 border-t border-slate-200 rounded-b-2xl">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setStartIndex(0)}
                  disabled={startIndex === 0}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Reset to Top"
                >
                  <ChevronDoubleUpIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setStartIndex((prev) => Math.max(0, prev - PAGE_SIZE))
                  }
                  disabled={startIndex === 0}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Previous Page"
                >
                  <ChevronUpIcon className="w-4 h-4" />
                </button>
              </div>

              <span className="text-[9px] font-mono font-bold tracking-widest text-slate-400">
                PAGE {currentPage} OF {totalPages}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setStartIndex((prev) =>
                      Math.min(prev + PAGE_SIZE, maxStartIndex),
                    )
                  }
                  disabled={startIndex === maxStartIndex}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Next Page"
                >
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setStartIndex(maxStartIndex)}
                  disabled={startIndex === maxStartIndex}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Go to End"
                >
                  <ChevronDoubleDownIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </DraggableColumn>
    );
  },
);
export default SavedClusterColumn;
