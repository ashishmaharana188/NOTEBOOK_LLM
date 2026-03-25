import React, { useState, useEffect } from "react";
import { motion, useTransform, useMotionValue } from "framer-motion";
import {
  XMarkIcon,
  DocumentTextIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import BlockPreview from "../media/BlockPreview";
import { getCardRole } from "../utils/spatialConstants"; // <--- REDUNDANT IMPORTS REMOVED
import {
  extractStickiesFromTags,
  stripStickyDataFromTags,
} from "../utils/stickyData";
import useIsTouchDevice from "../../../../hooks/appTools/useIsTouchDevice";

const SpatialCard = React.memo(
  ({
    chunk,
    index,
    total,
    isExpanded,
    direction,
    onExpand,
    isActive,
    onSetActive,
    canvasScale,
    primarySizeOffset,
    canvasMode,
    onUpdateStickies,
    onModifyQuickThought,
    enginePos,
    onDragEndCard,
    isSelected,
    cardZIndex,
    dragDeltaX,
    dragDeltaY,
    selectedItemIds,
    selectedItemIdSet,
    onInteract,
    linkSummary,
    onOpenMindMap,
    interactionReduced,
    hideStickies,
  }: any) => {
    const [isLandscape, setIsLandscape] = useState(false);
    const [isDraggingCard, setIsDraggingCard] = useState(false);
    const isTouchDevice = useIsTouchDevice();
    const role = getCardRole(index, chunk, canvasMode);
    const [qtText, setQtText] = useState(chunk.text || "");

    useEffect(() => {
      if (role === "QUICK_THOUGHT") {
        setQtText(chunk.text || "");
      }
    }, [chunk.text, role]);

    // --- PERSISTENT LOCAL STICKIES STATE ---
    const [localStickies, setLocalStickies] = useState<any[]>(() =>
      extractStickiesFromTags(chunk.tags),
    );

    useEffect(() => {
      setLocalStickies(extractStickiesFromTags(chunk.tags));
    }, [chunk.tags]);

    const saveStickiesToDB = (newStickies: any[]) => {
      setLocalStickies(newStickies);
      if (onUpdateStickies) {
        const baseTags = stripStickyDataFromTags(chunk.tags);
        const tagString =
          newStickies.length > 0
            ? `${baseTags} sticky_data:${JSON.stringify(newStickies)}`
            : baseTags;

        const actualId =
          chunk.group_id ||
          chunk.stack_id ||
          chunk.note_id ||
          chunk.echo_id ||
          chunk.id;
        let actualType =
          chunk.type || (role.includes("NOTE") ? "note" : "echo");
        if (chunk.relation === "Folder") actualType = "group";
        if (chunk.relation === "Stack") actualType = "stack";

        onUpdateStickies(actualId, tagString, actualType);
      }
    };

    const handleAddLocalSticky = (e: React.MouseEvent) => {
      e.stopPropagation();
      const corners = [
        "top-[-20px] left-[-20px] -rotate-6 bg-pink-100 border-pink-200 text-pink-900",
        "top-[-20px] right-[-20px] rotate-6 bg-yellow-100 border-yellow-200 text-yellow-900",
        "bottom-[-20px] left-[-20px] -rotate-12 bg-sky-100 border-sky-200 text-sky-900",
        "bottom-[-20px] right-[-20px] rotate-12 bg-emerald-100 border-emerald-200 text-emerald-900",
      ];
      const randomCorner = corners[Math.floor(Math.random() * corners.length)];
      const newSticky = { id: Date.now(), styleClass: randomCorner, text: "" };
      saveStickiesToDB([...localStickies, newSticky]);
    };

    const handleRemoveSticky = (e: React.MouseEvent, idToRemove: number) => {
      e.stopPropagation();
      saveStickiesToDB(localStickies.filter((s) => s.id !== idToRemove));
    };

    const handleStickyTextChange = (idToUpdate: number, newText: string) => {
      setLocalStickies(
        localStickies.map((s) =>
          s.id === idToUpdate ? { ...s, text: newText } : s,
        ),
      );
    };

    // --- TACTILE RESIZING STATE ---
    const [sizeOffset, setSizeOffset] = useState({ w: 0, h: 0 });
    const [radiusOffset, setRadiusOffset] = useState(0);
    const dragRef = React.useRef<{
      type: "size" | "radius" | null;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      startR: number;
    }>({ type: null, startX: 0, startY: 0, startW: 0, startH: 0, startR: 0 });

    const cardRef = React.useRef<HTMLDivElement>(null);
    const isDraggingRef = React.useRef(false);

    let baseW = 0,
      baseH = 0,
      bgClass = "",
      gradientClass = "",
      textClass = "";

    let customW = 0;
    let customH = 0;
    const tagsStr = chunk.tags || "";
    if (tagsStr.includes("size:A3")) {
      customW = 600;
      customH = 800;
    } else if (tagsStr.includes("size:A4")) {
      customW = 450;
      customH = 600;
    } else if (tagsStr.includes("size:A5")) {
      customW = 300;
      customH = 400;
    } else if (tagsStr.includes("size:A6")) {
      customW = 200;
      customH = 300;
    } else if (tagsStr.includes("size:A7")) {
      customW = 150;
      customH = 200;
    }

    if (role === "QUICK_THOUGHT") {
      baseW = isLandscape ? 180 : 140;
      baseH = isLandscape ? 140 : 180;
      const stickyColors = [
        {
          bg: "bg-pink-100 border-pink-200 text-pink-950",
          grad: "from-pink-100",
        },
        {
          bg: "bg-emerald-100 border-emerald-200 text-emerald-950",
          grad: "from-emerald-100",
        },
        { bg: "bg-sky-100 border-sky-200 text-sky-950", grad: "from-sky-100" },
        {
          bg: "bg-amber-100 border-amber-200 text-amber-950",
          grad: "from-amber-100",
        },
        {
          bg: "bg-violet-100 border-violet-200 text-violet-950",
          grad: "from-violet-100",
        },
      ];
      const color = stickyColors[index % stickyColors.length] ?? {
        bg: "bg-pink-100 border-pink-200 text-pink-950",
        grad: "from-pink-100",
      };
      bgClass = color.bg;
      gradientClass = color.grad;
      textClass = "text-inherit opacity-80";
    } else if (role === "A5_NOTE" || role === "A5_ECHO") {
      baseW = customW
        ? isLandscape
          ? customH
          : customW
        : isLandscape
          ? 280
          : 200;
      baseH = customH
        ? isLandscape
          ? customW
          : customH
        : isLandscape
          ? 200
          : 280;
      bgClass =
        role === "A5_NOTE"
          ? "bg-yellow-50 border-yellow-200 text-slate-900"
          : "bg-purple-50 border-purple-200 text-slate-900";
      gradientClass = role === "A5_NOTE" ? "from-yellow-50" : "from-purple-50";
      textClass = "text-slate-600";
    } else {
      baseW = customW
        ? isLandscape
          ? customH
          : customW
        : isLandscape
          ? 400
          : 300;
      baseH = customH
        ? isLandscape
          ? customW
          : customH
        : isLandscape
          ? 300
          : 400;
      bgClass = "bg-white border-slate-200 text-slate-900";
      gradientClass = "from-white";
      textClass = "text-slate-600";
    }

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
          latestW = Math.max(-10, Math.min(50, latestW));
          latestH = Math.max(-10, Math.min(50, latestH));
          cardRef.current.style.width = `${baseW + latestW}px`;
          cardRef.current.style.height = `${baseH + latestH}px`;
        } else if (dragRef.current.type === "radius") {
          latestR = dragRef.current.startR + deltaX;
          latestR = Math.max(-20, Math.min(24, latestR));
          cardRef.current.style.borderRadius = `${24 + latestR}px`;
        }
      };

      const handleMouseUp = () => {
        if (dragRef.current.type) {
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
    }, [canvasScale, baseW, baseH, sizeOffset, radiusOffset]);

    const startDrag = (
      e: React.PointerEvent | React.MouseEvent,
      type: "size" | "radius",
    ) => {
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

    const finalWidth = baseW + sizeOffset.w;
    const finalHeight = baseH + sizeOffset.h;
    const finalRadius = 24 + radiusOffset;
    const stackOffsetX = (index % 2 === 0 ? 3 : -3) * (index % 3);
    const stackOffsetY = index * -4;

    const collapsedX = stackOffsetX - finalWidth / 2;
    const collapsedY = stackOffsetY - finalHeight / 2;
    // --- THE FIX: DYNAMIC COLLAPSE SCALING ---
    // Calculate a dynamic shrink scale so large custom cards (like A3, A4)
    // fit perfectly behind the main slot cover when unscattered.
    let standardW = 300;
    if (role === "QUICK_THOUGHT") {
      standardW = isLandscape ? 180 : 140;
    } else if (role === "A5_NOTE" || role === "A5_ECHO") {
      standardW = isLandscape ? 280 : 200;
    } else {
      standardW = isLandscape ? 400 : 300;
    }

    const scaleAdjustment = finalWidth > 0 ? standardW / finalWidth : 1;
    const collapsedScale = scaleAdjustment * (1 - index * 0.015);
    // --- STALE LOGIC REMOVED! THE CARD NOW BLINDLY TRUSTS THE PARENT PHYSICS ENGINE ---
    const expandedX = enginePos?.x ?? 0;
    const expandedY = enginePos?.y ?? 0;

    const isLeftStack = direction === "RIGHT";
    const cardId =
      chunk.echo_id || chunk.note_id || chunk.chunk_id || `idx-${index}`;
    const isCardSelected =
      selectedItemIdSet?.has?.(cardId) || selectedItemIds?.includes(cardId);
    const isFollower =
      isCardSelected && !isDraggingRef.current;

    const fallbackX = useMotionValue(0);
    const fallbackY = useMotionValue(0);
    const safeDragX = dragDeltaX || fallbackX;
    const safeDragY = dragDeltaY || fallbackY;

    const followerX = useTransform(safeDragX, (x: number) => {
      if (isDraggingRef.current) return 0;
      if (isCardSelected) return x;
      return 0;
    });

    const followerY = useTransform(safeDragY, (y: number) => {
      if (isDraggingRef.current) return 0;
      if (isCardSelected) return y;
      return 0;
    });
    const reducedVisuals = interactionReduced || isDraggingCard;
    const stickyRemoveButtonVisibility = isTouchDevice
      ? "opacity-100"
      : "opacity-100 sm:opacity-0 sm:group-hover/sticky:opacity-100";
    const addStickyButtonVisibility = isTouchDevice
      ? "opacity-100"
      : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100";
    const previewMode =
      reducedVisuals || canvasScale < 0.42
        ? "compact"
        : canvasScale < 0.68
          ? "media"
          : "full";

    return (
      // 1. THE INVISIBLE ANCHOR (No shadows or backgrounds allowed here!)
      <motion.div
        ref={cardRef}
        data-selection-id={cardId}
        data-selectable={isExpanded ? "true" : "false"}
        drag={isExpanded}
        dragElastic={0}
        dragMomentum={false}
        whileDrag={{ zIndex: 99999 }}
        onPointerDownCapture={(e) => {
          if (isExpanded && onInteract) onInteract();
        }}
        onDragStart={() => {
          isDraggingRef.current = true;
          setIsDraggingCard(true);
        }}
        onDrag={(e, info) => {
          if (dragDeltaX && dragDeltaY && isCardSelected) {
            dragDeltaX.set(info.offset.x);
            dragDeltaY.set(info.offset.y);
          }
        }}
        onDragEnd={(e, info) => {
          if (isExpanded && onDragEndCard) {
            const isBulk = isCardSelected && selectedItemIds.length > 1;
            const startPos = { x: expandedX, y: expandedY };
            onDragEndCard(
              cardId,
              info.offset.x,
              info.offset.y,
              isBulk,
              startPos,
              e,
            );
          }
          if (dragDeltaX) dragDeltaX.set(0);
          if (dragDeltaY) dragDeltaY.set(0);
          setTimeout(() => {
            isDraggingRef.current = false;
            setIsDraggingCard(false);
          }, 150);
        }}
        initial={{
          x: collapsedX || 0,
          y: collapsedY || 0,
          scale: collapsedScale || 0.5,
          opacity: 0,
        }}
        animate={{
          x: isExpanded ? expandedX : collapsedX,
          y: isExpanded ? expandedY : collapsedY,
          scale: isExpanded ? 1 : collapsedScale,
          opacity: 1,
        }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 32,
          ...(isSelected
            ? {
                x: { duration: 0, type: "tween" },
                y: { duration: 0, type: "tween" },
              }
            : {}),
        }}
        style={{
          zIndex: cardZIndex !== undefined ? cardZIndex : total - index,
          transformOrigin: "center center",
          borderRadius: `${finalRadius}px`,
          width: finalWidth,
          height: finalHeight,
          willChange: "transform",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isDraggingRef.current) return;
          if (!isExpanded) onExpand(chunk);
          else onSetActive(chunk);
        }}
        className={`absolute top-0 left-0 cursor-pointer group ${
          reducedVisuals ? "canvas-interaction-reduced" : ""
        }`}
      >
        {/* ✨ 2. THE VISIBLE FOLLOWER (Inherits the exact size, handles all visuals and movement) ✨ */}
        <motion.div
          className={`absolute inset-0 flex flex-col rounded-[inherit] ${bgClass} shadow-xl border canvas-heavy-shell ${
            isSelected
              ? "ring-2 ring-green-400 border-green-400"
              : isActive && isExpanded
                ? "border-blue-400"
                : "border-transparent"
          }`}
          style={{ x: followerX, y: followerY }}
        >
          {role === "QUICK_THOUGHT" ? (
            <div className="relative w-full h-full p-4 flex flex-col rounded-[inherit]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onModifyQuickThought(
                    "delete",
                    chunk.id,
                    chunk.parent_id,
                    chunk.parent_type,
                  );
                }}
                className="absolute -top-2 -right-2 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-100 transition-opacity hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>

              <div className="flex justify-between items-start shrink-0 mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-inherit opacity-60">
                  <DocumentTextIcon className="w-3 h-3" /> Quick Thought
                </span>
              </div>

              <textarea
                className="no-pan w-full flex-1 bg-transparent resize-none text-xs font-serif placeholder-black/30 outline-none custom-scrollbar"
                placeholder="Jot a thought..."
                value={qtText}
                onChange={(e) => setQtText(e.target.value)}
                onBlur={() =>
                  onModifyQuickThought(
                    "update",
                    chunk.id,
                    chunk.parent_id,
                    chunk.parent_type,
                    qtText,
                  )
                }
                autoFocus={!chunk.text}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <>
              {isExpanded && role.includes("NOTE") && (
                <div
                  className={`absolute top-0 bottom-0 ${isLeftStack ? "-right-8 justify-start" : "-left-8 justify-end"} w-6 flex flex-col items-center pointer-events-none z-50 py-6`}
                >
                  <h4
                    className="text-[20px] font-black text-slate-500/80 uppercase tracking-[0.3em] whitespace-nowrap"
                    style={{
                      writingMode: "vertical-rl",
                      transform: isLeftStack ? "none" : "rotate(180deg)",
                    }}
                  >
                    {chunk.title || chunk.bridge || "TITLE"}
                  </h4>
                </div>
              )}
              <div className="absolute inset-0 overflow-hidden rounded-[inherit] z-10 pointer-events-none">
                <BlockPreview
                  htmlContent={chunk.text}
                  textClass={textClass}
                  isNote={role.includes("NOTE")}
                  title={chunk.title || chunk.bridge || "Title"}
                  previewMode={previewMode}
                />
                {isExpanded && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLandscape(!isLandscape);
                    }}
                    className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors active:scale-90 shadow-md z-[60] pointer-events-auto"
                  >
                    <ArrowsRightLeftIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}

          {!hideStickies &&
            !reducedVisuals &&
            localStickies.map((sticky) => (
            <div
              key={sticky.id}
              className={`absolute w-28 h-28 p-3 shadow-md border z-[60] transition-transform hover:scale-105 hover:z-[70] group/sticky canvas-heavy-ornament ${sticky.styleClass}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => handleRemoveSticky(e, sticky.id)}
                className={`absolute z-[80] flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-opacity hover:text-red-500 ${
                  isTouchDevice ? "right-1 top-1" : "-right-2 -top-2"
                } ${stickyRemoveButtonVisibility}`}
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
              <textarea
                className="w-full h-full bg-transparent resize-none text-[10px] font-serif placeholder-black/30 outline-none"
                placeholder="Jot a note..."
                value={sticky.text || ""}
                onChange={(e) =>
                  handleStickyTextChange(sticky.id, e.target.value)
                }
                onBlur={() => saveStickiesToDB(localStickies)}
              />
            </div>
          ))}

          {isExpanded && role !== "QUICK_THOUGHT" && (
            <button
              onClick={handleAddLocalSticky}
              className={`absolute z-[80] flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-md transition-all hover:text-pink-500 active:scale-90 ${
                isTouchDevice ? "right-14 top-3" : "-right-3 -top-3"
              } ${addStickyButtonVisibility}`}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          )}

          {isExpanded && role !== "QUICK_THOUGHT" && linkSummary?.count > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenMindMap) onOpenMindMap(cardId);
              }}
              className="absolute bottom-4 left-4 z-[85] max-w-[70%] px-3 py-2 rounded-xl bg-slate-900/90 text-white text-left shadow-lg border border-slate-700/60 pointer-events-auto hover:bg-slate-800 transition-colors"
              title="Open linked relationships in Mind Map"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                Linked to {linkSummary.count}
              </div>
              {(linkSummary.primaryLinkedTitle || linkSummary.primaryEchoTitle) && (
                <div className="text-[10px] text-slate-300 truncate mt-0.5">
                  {linkSummary.primaryLinkedTitle || linkSummary.primaryEchoTitle}
                </div>
              )}
            </button>
          )}

          {isExpanded && isActive && (
            <>
              <div
                className="no-pan-resize absolute bottom-0 right-0 z-50 flex h-8 w-8 cursor-nwse-resize items-end justify-end p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onMouseDown={(e) => startDrag(e, "size")}
                onPointerDownCapture={(e) => startDrag(e, "size")}
              >
                <div
                  className={`w-3 h-3 border-r-2 border-b-2 rounded-br-sm pointer-events-none ${role === "QUICK_THOUGHT" ? "border-black/20" : "border-slate-300"}`}
                />
              </div>
              <div
                className="no-pan-resize absolute top-0 right-0 z-50 flex h-8 w-8 cursor-nesw-resize items-start justify-end p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onMouseDown={(e) => startDrag(e, "radius")}
                onPointerDownCapture={(e) => startDrag(e, "radius")}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full pointer-events-none ${role === "QUICK_THOUGHT" ? "bg-black/20" : "bg-slate-300"}`}
                />
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    );
  },
);

export default SpatialCard;
