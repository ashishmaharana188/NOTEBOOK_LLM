import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpenIcon,
  PencilSquareIcon, // <--- ADDED ICON
  TrashIcon,
} from "@heroicons/react/24/outline";

const DEFAULT_COLUMN_WIDTH = 420;
const DEFAULT_COLUMN_HEIGHT = 750;
const MIN_COLUMN_WIDTH = 340;
const MIN_COLUMN_HEIGHT = 320;

const DraggableColumn = React.memo(
  ({
    id,
    initialPos,
    onDragEnd,
    title,
    author,
    children,
    zIndex,
    bringToFront,
    scale,
    isHighlighted,
    onMaximize,
    disableScroll,
    setIsCanvasWheelDisabled,
    interactionReduced,
    onRename, // <--- NEW PROP
    onDelete,
    defaultWidth = DEFAULT_COLUMN_WIDTH,
    defaultHeight = DEFAULT_COLUMN_HEIGHT,
  }: any) => {
    const [localPos, setLocalPos] = useState(initialPos);
    const [localSize, setLocalSize] = useState({
      width: defaultWidth,
      height: defaultHeight,
    });

    const [dragState, setDragState] = useState({ active: false, shift: false });
    const dragRef = useRef({ startX: 0, startY: 0, x: 0, y: 0 });
    const currentPos = useRef(initialPos);
    const shellRef = useRef<HTMLDivElement | null>(null);
    const positionFrameRef = useRef<number | null>(null);
    const resizeRef = useRef({
      startX: 0,
      startY: 0,
      width: defaultWidth,
      height: defaultHeight,
    });
    const currentSize = useRef({
      width: defaultWidth,
      height: defaultHeight,
    });
    const sizeFrameRef = useRef<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(title);

    const applyPosition = useCallback((nextPos: { x: number; y: number }) => {
      if (!shellRef.current) return;
      shellRef.current.style.transform = `translate3d(${nextPos.x}px, ${nextPos.y}px, 0)`;
    }, []);

    const schedulePosition = useCallback(() => {
      if (positionFrameRef.current !== null) return;
      positionFrameRef.current = window.requestAnimationFrame(() => {
        positionFrameRef.current = null;
        applyPosition(currentPos.current);
      });
    }, [applyPosition]);

    const applySize = useCallback(
      (nextSize: { width: number; height: number }) => {
        if (!shellRef.current) return;
        shellRef.current.style.width = `${nextSize.width}px`;
        shellRef.current.style.height = `${nextSize.height}px`;
      },
      [],
    );

    const scheduleSize = useCallback(() => {
      if (sizeFrameRef.current !== null) return;
      sizeFrameRef.current = window.requestAnimationFrame(() => {
        sizeFrameRef.current = null;
        applySize(currentSize.current);
      });
    }, [applySize]);

    useEffect(() => {
      setEditTitle(title);
    }, [title]);

    // THE FIX FOR STACKING: This forces the column to snap into the grid
    // when the layout engine finishes calculating the coordinates.
    useEffect(() => {
      setLocalPos(initialPos);
      currentPos.current = initialPos;
      applyPosition(initialPos);
    }, [applyPosition, initialPos?.x, initialPos?.y]);

    useEffect(() => {
      currentSize.current = localSize;
      applySize(localSize);
    }, [applySize, localSize]);

    useEffect(() => {
      const nextSize = {
        width: defaultWidth,
        height: defaultHeight,
      };
      setLocalSize(nextSize);
      currentSize.current = nextSize;
      applySize(nextSize);
    }, [applySize, defaultHeight, defaultWidth]);

    useEffect(() => {
      return () => {
        if (positionFrameRef.current !== null) {
          window.cancelAnimationFrame(positionFrameRef.current);
        }
        if (sizeFrameRef.current !== null) {
          window.cancelAnimationFrame(sizeFrameRef.current);
        }
      };
    }, []);

    const handleDragPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      bringToFront(id);
      setDragState({ active: true, shift: e.shiftKey });
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        x: localPos.x,
        y: localPos.y,
      };
    };

    useEffect(() => {
      const handlePointerMove = (e: PointerEvent) => {
        if (dragState.active) {
          const dx = (e.clientX - dragRef.current.startX) / scale;
          const dy = (e.clientY - dragRef.current.startY) / scale;
          const newPos = { x: dragRef.current.x + dx, y: dragRef.current.y + dy };
          currentPos.current = newPos;
          schedulePosition();
          return;
        }

        if (isResizing) {
          const dx = (e.clientX - resizeRef.current.startX) / scale;
          const dy = (e.clientY - resizeRef.current.startY) / scale;
          currentSize.current = {
            width: Math.max(
              MIN_COLUMN_WIDTH,
              Math.round(resizeRef.current.width + dx),
            ),
            height: Math.max(
              MIN_COLUMN_HEIGHT,
              Math.round(resizeRef.current.height + dy),
            ),
          };
          scheduleSize();
        }
      };

      const handlePointerUp = () => {
        if (dragState.active) {
          setDragState({ active: false, shift: false });
          setLocalPos(currentPos.current);
          onDragEnd(id, currentPos.current, dragState.shift);
        }
        if (isResizing) {
          setIsResizing(false);
          setLocalSize(currentSize.current);
        }
      };

      if (dragState.active || isResizing) {
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
      }
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }, [
      dragState.active,
      dragState.shift,
      id,
      isResizing,
      onDragEnd,
      scale,
      schedulePosition,
      scheduleSize,
    ]);

    const reducedVisuals = interactionReduced || dragState.active || isResizing;

    return (
      <div
        ref={shellRef}
        id={id}
        onMouseEnter={() => setIsCanvasWheelDisabled?.(true)}
        onMouseLeave={() => setIsCanvasWheelDisabled?.(false)}
        onWheel={(e) => e.stopPropagation()}
        className={`no-pan absolute flex flex-col bg-white/95 rounded-2xl border canvas-heavy-shell ${
          isHighlighted
            ? "border-slate-400 shadow-xl z-[9999]"
            : "border-slate-200 shadow-xl"
        } ${dragState.active ? "shadow-2xl cursor-grabbing scale-[1.01]" : ""} ${isResizing ? "select-none" : ""} ${
          reducedVisuals ? "canvas-interaction-reduced" : ""
        }`}
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${localPos.x}px, ${localPos.y}px, 0)`,
          willChange: isResizing ? "transform, width, height" : "transform",
          contain: "layout paint style",
          backfaceVisibility: "hidden",
          width: `${localSize.width}px`,
          height: `${localSize.height}px`,
          zIndex: isHighlighted ? 9999 : zIndex,
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          bringToFront(id);
        }}
      >
        <div
          onPointerDown={handleDragPointerDown}
          className="p-5 border-b border-slate-100 flex items-center justify-between cursor-grab active:cursor-grabbing bg-transparent hover:bg-slate-50 transition-colors rounded-t-2xl group/header canvas-heavy-transition"
          style={{ touchAction: "none" }}
        >
          <div className="flex items-center gap-3 w-full pr-4">
            <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 pointer-events-none">
              <BookOpenIcon className="w-5 h-5 text-blue-600" />
            </div>

            <div className="overflow-hidden flex-1">
              {isEditingTitle ? (
                <input
                  autoFocus
                  className="w-full text-base font-extrabold text-slate-800 border-none bg-slate-100 rounded px-1 py-0 outline-none ring-2 ring-blue-400"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsEditingTitle(false);
                      if (
                        onRename &&
                        editTitle.trim() &&
                        editTitle.trim() !== title
                      )
                        onRename(editTitle.trim());
                    }
                  }}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    if (
                      onRename &&
                      editTitle.trim() &&
                      editTitle.trim() !== title
                    )
                      onRename(editTitle.trim());
                  }}
                  onMouseDown={(e) => e.stopPropagation()} // Prevents dragging while clicking the input
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex items-center gap-2 group/title">
                  <h3
                    className="text-base font-extrabold text-slate-800 font-sans tracking-tight leading-none truncate max-w-[240px] cursor-text"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setIsEditingTitle(true);
                    }}
                  >
                    {title}
                  </h3>
                  {onRename && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()} // 1. Stops the drag engine from picking up the column
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsEditingTitle(true); // 2. Safely triggers edit mode ONLY after a full click finishes
                      }}
                      className="opacity-0 group-hover/title:opacity-100 p-1 -m-1 text-slate-400 hover:text-blue-600 transition-opacity"
                      title="Rename Column"
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-[10px] font-mono font-bold text-slate-400 mt-1.5 uppercase tracking-widest truncate pointer-events-none">
                {author}
              </p>
            </div>
          </div>

          {/* TOP RIGHT DELETE BUTTON */}
          {onDelete && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 -m-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover/header:opacity-100"
              title="Delete Column & Branches"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* --- BOTTOM BODY WRAPPER --- */}
        <div
          className={`flex-1 min-h-0 relative cursor-auto rounded-b-2xl p-2 ${
            disableScroll
              ? "overflow-hidden bg-slate-50/50"
              : "overflow-y-auto custom-scrollbar bg-slate-50/50"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => {
            if (!disableScroll) e.stopPropagation();
          }}
          onWheelCapture={(e) => {
            if (!disableScroll) e.stopPropagation();
          }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {children}
        </div>

        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            bringToFront(id);
            setIsResizing(true);
            resizeRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              width: localSize.width,
              height: localSize.height,
            };
          }}
          className="absolute bottom-2 right-2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 shadow-sm cursor-nwse-resize"
          title="Resize Column"
          style={{ touchAction: "none" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path
              d="M5 11L11 5M8 11L11 8M11 11L11 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    );
  },
);

export default DraggableColumn;
