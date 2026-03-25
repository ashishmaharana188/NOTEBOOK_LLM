import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ArchiveFolderCard from "../../../appTools/archiveCardComponent/archiveFolderCard";
import BinderCoverPreview from "../../../appTools/archiveCardComponent/binderCoverPreview";
import { getGridAnimationProps } from "../../../../hooks/appTools/useGridLayout";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

const SpatialArchiveFolder = React.memo(
    ({
        item,
        itemId,
        baseX,
        baseY,
        gridOffsetX,
        gridOffsetY,
        isSelected,
        isBeingGridded,
        gridAnimationTargets,
        gridZIndexes,
        savedMeta,
        isVisible,
        spatialMetadata,
        bringToFrontGrid,
        updateGridPosition,
        canvasMode,
        onSelect,
        onDrillDown,
        selectedItemIds = [],
        selectedItemIdSet,
        isMergeMode,
        onAppendToArchive,
        interactionReduced,
    }: any) => {
        const [isFannedOut, setIsFannedOut] = useState(false);
        const [isDraggingFolder, setIsDraggingFolder] = useState(false);

        // NEW: Track hover state for the floating title badge
        const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
        const resolvedSelectedItemIdSet = useMemo(
            () => selectedItemIdSet || new Set(selectedItemIds),
            [selectedItemIdSet, selectedItemIds],
        );

        const { archiveChildren, previewItems } = useMemo(() => {
            const children = item.chunks || [];
            const sorted = [...children].sort((a: any, b: any) => {
                const idA = a.id || a.stack_id;
                const idB = b.id || b.stack_id;
                const orientA = spatialMetadata[idA]?.orientation || "portrait";
                const orientB = spatialMetadata[idB]?.orientation || "portrait";
                if (orientA === "landscape" && orientB !== "landscape")
                    return -1;
                if (orientB === "landscape" && orientA !== "landscape")
                    return 1;
                return 0;
            });
            return {
                archiveChildren: children,
                previewItems: sorted.slice(0, 4),
            };
        }, [item.chunks, spatialMetadata]);

        const [localPosState, setLocalPosState] = useState({
            x: baseX,
            y: baseY,
        });
        const [localPos, setLocalPos] = useState({ x: baseX, y: baseY });

        // THE FIX: Move state sync to useEffect to prevent render-time loops and jitter!
        useEffect(() => {
            setLocalPos({ x: baseX, y: baseY });
        }, [baseX, baseY]);

        const isDraggingFolderRef = React.useRef(false);

        const resolvedX = localPos.x + gridOffsetX;
        const resolvedY = localPos.y + gridOffsetY;
        const finalSnapPos = gridAnimationTargets
            ? gridAnimationTargets[itemId]
            : undefined;

        const targetX = finalSnapPos ? finalSnapPos.x + gridOffsetX : resolvedX;
        const targetY = finalSnapPos ? finalSnapPos.y + gridOffsetY : resolvedY;

        const { animate, transition } = getGridAnimationProps(
            isBeingGridded,
            resolvedX,
            resolvedY,
            targetX,
            targetY,
            true,
        );

        const [localTitle, setLocalTitle] = useState(
            item.title || "Archived Items",
        );
        const reducedVisuals = interactionReduced || isDraggingFolder;
        React.useEffect(() => {
            setLocalTitle(item.title || "Archived Items");
        }, [item.title]);

        const handleUpdateTitle = async (newTitle: string) => {
            setLocalTitle(newTitle); // Instantly update UI
            try {
                await fetch(
                    buildApiUrl("/brain/archive/update_title"),
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            archive_id: item.id || item.stack_id,
                            title: newTitle,
                            type: canvasMode,
                        }),
                    },
                );
            } catch (e) {
                console.error("Failed to rename outer archive", e);
            }
        };

        const getArchiveTargetIdFromPointer = React.useCallback(
            (event: any) => {
                const clientX =
                    event?.clientX ??
                    event?.changedTouches?.[0]?.clientX ??
                    null;
                const clientY =
                    event?.clientY ??
                    event?.changedTouches?.[0]?.clientY ??
                    null;

                if (clientX === null || clientY === null) return null;

                const archiveNode = document
                    .elementsFromPoint(clientX, clientY)
                    .find((el) => el.hasAttribute("data-archive-id"));

                return archiveNode?.getAttribute("data-archive-id") || null;
            },
            [],
        );

        return (
            <motion.div
                drag
                dragElastic={0}
                dragMomentum={false}
                initial={{ x: baseX, y: baseY, scale: 0 }}
                animate={animate}
                transition={transition as any}
                className={`absolute no-pan ${
                    reducedVisuals ? "canvas-interaction-reduced" : ""
                }`}
                style={{
                    zIndex:
                        gridZIndexes[itemId] ||
                        savedMeta?.z_index ||
                        (isSelected ? 9999 : 10),
                    outline:
                        isSelected && !isFannedOut
                            ? "2px solid #4ade80"
                            : "none",
                    outlineOffset: "8px",
                    borderRadius: "16px",
                    willChange: "transform, opacity",
                }}
                whileDrag={{ zIndex: 99999 }}
                onDragStart={() => {
                    isDraggingFolderRef.current = true;
                    setIsDraggingFolder(true);
                    if (bringToFrontGrid) bringToFrontGrid(itemId);
                }}
                onDragEnd={(_, info) => {
                    const newX = localPos.x + info.offset.x;
                    const newY = localPos.y + info.offset.y;
                    setLocalPosState({ x: newX, y: newY });
                    if (updateGridPosition)
                        updateGridPosition(itemId, newX, newY);

                    setTimeout(() => {
                        isDraggingFolderRef.current = false;
                        setIsDraggingFolder(false);
                    }, 150);
                }}
            >
                {isVisible && (
                    <div className="relative">
                        {/* 1. THE BASE FOLDER */}
                        <div className="relative z-50">
                            <ArchiveFolderCard
                                id={item.id || item.stack_id}
                                title={localTitle}
                                onUpdateTitle={handleUpdateTitle}
                                count={archiveChildren.length}
                                isEmpty={archiveChildren.length === 0}
                                isOuterStack={true}
                                onSingleClick={() => {
                                    if (isDraggingFolderRef.current) return;
                                    if (onSelect) onSelect(itemId);
                                }}
                                onDoubleClick={() => {
                                    if (isDraggingFolderRef.current) return;
                                    setIsFannedOut((prev) => !prev);
                                }}
                            >
                                {!isFannedOut &&
                                    previewItems.map(
                                        (child: any, idx: number) => {
                                            const childId =
                                                canvasMode === "ECHO"
                                                    ? child.id
                                                    : child.stack_id;
                                            const meta =
                                                spatialMetadata[childId] || {};
                                            return (
                                                <BinderCoverPreview
                                                    key={idx}
                                                    title={
                                                        child.title ||
                                                        child.book_id ||
                                                        "Archived Content"
                                                    }
                                                    coverMedia={
                                                        child.cover_media ||
                                                        child.cover_image
                                                    }
                                                    orientation={
                                                        meta.orientation ||
                                                        "portrait"
                                                    }
                                                />
                                            );
                                        },
                                    )}
                            </ArchiveFolderCard>
                        </div>

                        {/* 2. THE FANNED OUT DECK OF CARDS */}
                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                            <AnimatePresence>
                                {isFannedOut &&
                                    archiveChildren.map(
                                        (child: any, idx: number) => {
                                            const childId =
                                                canvasMode === "ECHO"
                                                    ? child.id
                                                    : child.stack_id;
                                            const meta =
                                                spatialMetadata[childId] || {};
                                            const isChildSelected =
                                                resolvedSelectedItemIdSet.has(
                                                    childId,
                                                );
                                            const isHovered =
                                                hoveredCardId === childId;

                                            return (
                                                <motion.div
                                                    key={childId}
                                                    className="absolute top-0 left-0 pointer-events-auto cursor-pointer"
                                                    drag={isMergeMode}
                                                    dragElastic={0}
                                                    dragMomentum={false}
                                                    initial={{
                                                        x: 0,
                                                        opacity: 0,
                                                        scale: 0.8,
                                                    }}
                                                    animate={{
                                                        x: 280 + idx * 110,
                                                        opacity: 1,
                                                        scale: 1,
                                                        y: isChildSelected
                                                            ? -15
                                                            : 0,
                                                    }}
                                                    exit={{
                                                        x: 0,
                                                        opacity: 0,
                                                        scale: 0.5,
                                                    }}
                                                    transition={{
                                                        type: "spring",
                                                        stiffness: 300,
                                                        damping: 25,
                                                        delay: idx * 0.04,
                                                    }}
                                                    // THE FIX: Boost z-index on hover so the badge doesn't clip under the next card!
                                                    style={{
                                                        zIndex: isHovered
                                                            ? 60
                                                            : 40 - idx,
                                                    }}
                                                    // THE FIX: Mouse event listeners for the hover state
                                                    onMouseEnter={() =>
                                                        setHoveredCardId(
                                                            childId,
                                                        )
                                                    }
                                                    onMouseLeave={() =>
                                                        setHoveredCardId(null)
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onSelect)
                                                            onSelect(childId);
                                                    }}
                                                    onDragEnd={(event) => {
                                                        if (
                                                            !isMergeMode ||
                                                            !onAppendToArchive
                                                        )
                                                            return;

                                                        const targetArchiveId =
                                                            getArchiveTargetIdFromPointer(
                                                                event,
                                                            );
                                                        if (!targetArchiveId)
                                                            return;

                                                        const isBulk =
                                                            resolvedSelectedItemIdSet.has(
                                                                childId,
                                                            ) &&
                                                            selectedItemIds.length >
                                                                1;

                                                        onAppendToArchive(
                                                            targetArchiveId,
                                                            isBulk
                                                                ? selectedItemIds
                                                                : [childId],
                                                        );
                                                    }}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onDrillDown) {
                                                            // THE FIX: Stop hijacking the path.
                                                            // Always append the ID so we strictly stay INSIDE the Archive Vault!
                                                            onDrillDown(
                                                                childId,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <div className="w-[260px] h-[360px] relative">
                                                        {/* THE FIX: Title Badge only appears on Hover now */}
                                                        <AnimatePresence>
                                                            {isHovered && (
                                                                <motion.div
                                                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 pointer-events-none w-max z-[100]"
                                                                    initial={{
                                                                        opacity: 0,
                                                                        y: 10,
                                                                        scale: 0.9,
                                                                    }}
                                                                    animate={{
                                                                        opacity: 1,
                                                                        y: 0,
                                                                        scale: 1,
                                                                    }}
                                                                    exit={{
                                                                        opacity: 0,
                                                                        y: 10,
                                                                        scale: 0.9,
                                                                    }}
                                                                    transition={{
                                                                        type: "spring",
                                                                        stiffness: 400,
                                                                        damping: 25,
                                                                    }}
                                                                >
                                                                    <div className="bg-slate-800/95   text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.3)] border border-slate-700 truncate max-w-[240px]">
                                                                        {child.title ||
                                                                            child.book_id ||
                                                                            "Archived Content"}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        <div
                                                            className={`w-full h-full rounded-2xl overflow-hidden shadow-2xl transition-all ${
                                                                isChildSelected
                                                                    ? "ring-2 ring-blue-500 bg-white"
                                                                    : "border border-slate-200 bg-white"
                                                            }`}
                                                        >
                                                            {/* ✨ THE FIX: Check for media. If none exists, render the item list exactly like SpatialStack! */}
                                                            {child.cover_media ||
                                                            child.cover_image ? (
                                                                <BinderCoverPreview
                                                                    title={
                                                                        child.title ||
                                                                        child.book_id ||
                                                                        "Archived Content"
                                                                    }
                                                                    coverMedia={
                                                                        child.cover_media ||
                                                                        child.cover_image
                                                                    }
                                                                    orientation={
                                                                        meta.orientation ||
                                                                        "portrait"
                                                                    }
                                                                    hideTitleOverlay={
                                                                        true
                                                                    }
                                                                />
                                                            ) : (
                                                                <div className="absolute inset-0 bg-white rounded-[inherit] p-6 pt-10 flex flex-col">
                                                                    <ul className="flex-1 overflow-hidden flex flex-col gap-4">
                                                                        {(
                                                                            child.chunks ||
                                                                            []
                                                                        )
                                                                            .slice(
                                                                                0,
                                                                                5,
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    innerItem: any,
                                                                                    idx: number,
                                                                                ) => (
                                                                                    <li
                                                                                        key={
                                                                                            idx
                                                                                        }
                                                                                        className="border-b border-slate-100 pb-2 last:border-0"
                                                                                    >
                                                                                        <h4 className="font-bold text-slate-700 text-xs leading-snug line-clamp-2">
                                                                                            {innerItem.title ||
                                                                                                innerItem.bridge ||
                                                                                                innerItem.text?.substring(
                                                                                                    0,
                                                                                                    30,
                                                                                                ) ||
                                                                                                "Untitled Note"}
                                                                                        </h4>
                                                                                    </li>
                                                                                ),
                                                                            )}
                                                                        {!(
                                                                            child.chunks &&
                                                                            child
                                                                                .chunks
                                                                                .length >
                                                                                0
                                                                        ) && (
                                                                            <li className="text-slate-400 italic text-xs py-2 text-center mt-10">
                                                                                Empty
                                                                                archive
                                                                                folder
                                                                            </li>
                                                                        )}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 z-50"></div>
                                                            {/* THE FIX: Location Tag Footer for 2-Level Inner Archives */}
                                                            {child.locationTag && (
                                                                <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 text-center shrink-0">
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                                                                        Origin
                                                                        Stack
                                                                    </span>
                                                                    <span className="text-[10px] font-bold text-slate-700 truncate block">
                                                                        {
                                                                            child.locationTag
                                                                        }
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        },
                                    )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </motion.div>
        );
    },
);

export default SpatialArchiveFolder;
