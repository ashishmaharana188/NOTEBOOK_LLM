import React, { useState, useEffect, useRef } from "react";
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
    onRename, // <--- NEW PROP
    onDelete,
  }: any) => {
    const [localPos, setLocalPos] = useState(initialPos);
    const [localSize, setLocalSize] = useState({
      width: DEFAULT_COLUMN_WIDTH,
      height: DEFAULT_COLUMN_HEIGHT,
    });

    const [dragState, setDragState] = useState({ active: false, shift: false });
    const dragRef = useRef({ startX: 0, startY: 0, x: 0, y: 0 });
    const currentPos = useRef(initialPos);
    const resizeRef = useRef({
      startX: 0,
      startY: 0,
      width: DEFAULT_COLUMN_WIDTH,
      height: DEFAULT_COLUMN_HEIGHT,
    });
    const [isResizing, setIsResizing] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(title);

    useEffect(() => {
      setEditTitle(title);
    }, [title]);

    // THE FIX FOR STACKING: This forces the column to snap into the grid
    // when the layout engine finishes calculating the coordinates.
    useEffect(() => {
      setLocalPos(initialPos);
      currentPos.current = initialPos;
    }, [initialPos?.x, initialPos?.y]);

    const handleMouseDown = (e: React.MouseEvent) => {
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
      const handleMouseMove = (e: MouseEvent) => {
        if (dragState.active) {
          const dx = (e.clientX - dragRef.current.startX) / scale;
          const dy = (e.clientY - dragRef.current.startY) / scale;
          const newPos = { x: dragRef.current.x + dx, y: dragRef.current.y + dy };
          currentPos.current = newPos;
          setLocalPos(newPos);
          return;
        }

        if (isResizing) {
          const dx = (e.clientX - resizeRef.current.startX) / scale;
          const dy = (e.clientY - resizeRef.current.startY) / scale;
          setLocalSize({
            width: Math.max(
              MIN_COLUMN_WIDTH,
              Math.round(resizeRef.current.width + dx),
            ),
            height: Math.max(
              MIN_COLUMN_HEIGHT,
              Math.round(resizeRef.current.height + dy),
            ),
          });
        }
      };

      const handleMouseUp = () => {
        if (dragState.active) {
          setDragState({ active: false, shift: false });
          onDragEnd(id, currentPos.current, dragState.shift);
        }
        if (isResizing) {
          setIsResizing(false);
        }
      };

      if (dragState.active || isResizing) {
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      }
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [dragState.active, dragState.shift, isResizing, scale, id, onDragEnd]);

    return (
      <div
        id={id}
        onMouseEnter={() => setIsCanvasWheelDisabled?.(true)}
        onMouseLeave={() => setIsCanvasWheelDisabled?.(false)}
        onWheel={(e) => e.stopPropagation()}
        className={`no-pan absolute flex flex-col bg-white/95 rounded-2xl border ${
          isHighlighted
            ? "border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.5)] scale-[1.02] z-[9999]"
            : "border-slate-200 shadow-xl"
        } ${dragState.active ? "shadow-2xl cursor-grabbing scale-[1.01]" : ""} ${isResizing ? "select-none" : ""}`}
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${localPos.x}px, ${localPos.y}px, 0)`,
          willChange: "transform",
          width: `${localSize.width}px`,
          height: `${localSize.height}px`,
          zIndex: isHighlighted ? 9999 : zIndex,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          bringToFront(id);
        }}
      >
        <div
          onMouseDown={handleMouseDown}
          className="p-5 border-b border-slate-100 flex items-center justify-between cursor-grab active:cursor-grabbing bg-transparent hover:bg-slate-50 transition-colors rounded-t-2xl group/header"
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
              onMouseDown={(e) => {
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
          onMouseDown={(e) => {
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
