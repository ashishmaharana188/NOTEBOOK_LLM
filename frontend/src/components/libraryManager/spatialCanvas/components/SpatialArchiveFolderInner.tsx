import React, { useRef } from "react";
import { motion, useTransform, useMotionValue } from "framer-motion";
import ArchiveFolderCard from "../../../appTools/archiveCardComponent/archiveFolderCard";
import BinderCoverPreview from "../../../appTools/archiveCardComponent/binderCoverPreview";
import { useRefreshBus } from "../../../system/RefreshBusProvider";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

const SpatialFolderCard = React.memo(
    ({
        folder,
        index,
        total,
        isExpanded,
        previewItems = [],
        isActive,
        enginePos,
        onExpand,
        onDragEndCard,
        onSetActive,
        isSelected,
        cardZIndex,
        onInteract,
        dragDeltaX,
        dragDeltaY,
        selectedItemIds,
        selectedItemIdSet,
        interactionReduced,
    }: any) => {
        // LOGIC REMAINS UNTOUCHED
        const { publish } = useRefreshBus();

        const dragStartPos = useRef({ x: 0, y: 0 });

        const isDraggingRef = useRef(false);
        const [isDraggingCard, setIsDraggingCard] = React.useState(false);

        const cardRef = useRef<HTMLDivElement>(null);

        const cardId = folder.chunk_id || folder.group_id || folder.id;
        const isCardSelected =
            selectedItemIdSet?.has?.(cardId) ||
            selectedItemIds?.includes(cardId);
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

        const stackOffsetX = (index % 2 === 0 ? 3 : -3) * (index % 3);
        const stackOffsetY = index * -4;
        const collapsedX = stackOffsetX - 130;
        const collapsedY = stackOffsetY - 180;
        const collapsedScale = 1 - index * 0.015;

        const expandedX = enginePos?.x ?? 0;
        const expandedY = enginePos?.y ?? 0;

        const folderId =
            folder.chunk_id || folder.group_id || `folder-${index}`;

        const [localTitle, setLocalTitle] = React.useState(
            folder.title || folder.bridge || "Archived Folder",
        );
        React.useEffect(() => {
            setLocalTitle(folder.title || folder.bridge || "Archived Folder");
        }, [folder.title, folder.bridge]);

        const handleUpdateTitle = async (newTitle: string) => {
            setLocalTitle(newTitle); // Instantly update UI
            try {
                await fetch(
                    buildApiUrl("/notes/groups/update"),
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            group_id: folderId,
                            title: newTitle,
                        }),
                    },
                );
            } catch (e) {
                console.error("Failed to rename inner archive", e);
            }
        };

        const handleDeleteFolder = async () => {
            try {
                const response = await fetch(
                    buildApiUrl(`/brain/archive/inner/${folderId}`),
                    {
                        method: "DELETE",
                    },
                );
                const payload = await response.json();
                if (payload.status === "success") {
                    publish(["canvas.snapshot", "notes.groups"]);
                }
            } catch (e) {
                console.error("Failed to delete empty inner archive", e);
            }
        };

        return (
            // 1. THE INVISIBLE ANCHOR
            <motion.div
                ref={cardRef}
                data-selection-id={
                    folder.chunk_id || folder.group_id || folder.id
                }
                data-selectable={isExpanded ? "true" : "false"}
                drag={isExpanded}
                dragElastic={0}
                dragMomentum={false}
                whileDrag={{ zIndex: 99999 }}
                onPointerDownCapture={(e) => {
                    if (isExpanded && onInteract) onInteract();
                }}
                onDragStart={(e, info) => {
                    isDraggingRef.current = true;
                    setIsDraggingCard(true);
                    dragStartPos.current = { x: expandedX, y: expandedY };
                }}
                onDrag={(e, info) => {
                    if (dragDeltaX && dragDeltaY && isCardSelected) {
                        dragDeltaX.set(info.offset.x);
                        dragDeltaY.set(info.offset.y);
                    }
                }}
                onDragEnd={(e, info) => {
                    if (isExpanded && onDragEndCard) {
                        const isBulk =
                            isCardSelected && selectedItemIds.length > 1;
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
                    stiffness: 220,
                    damping: 25,
                    // ✨ Disable spring physics on drop if selected so it teleports instantly!
                    ...(isSelected
                        ? {
                              x: { duration: 0, type: "tween" },
                              y: { duration: 0, type: "tween" },
                          }
                        : {}),
                }}
                style={{
                    zIndex:
                        cardZIndex !== undefined ? cardZIndex : total - index,
                    transformOrigin: "center center",

                    width: 260,
                    height: 360,
                    borderRadius: "24px",
                }}
                className={`absolute top-0 left-0 cursor-pointer group ${
                    reducedVisuals ? "canvas-interaction-reduced" : ""
                }`}
            >
                {/* ✨ 2. THE VISIBLE FOLLOWER (Inherits size, handles all visuals and movement) ✨ */}
                <motion.div
                    className={`absolute inset-0 flex flex-col rounded-2xl transition-shadow duration-200 canvas-heavy-shell ${
                        isSelected
                            ? "ring-3 ring-green-400/80 shadow-[0_0_15px_rgba(74,222,128,0.5)]"
                            : isActive && isExpanded
                              ? "ring-3 ring-blue-400"
                              : ""
                    }`}
                    style={{ x: followerX, y: followerY }}
                >
                    <ArchiveFolderCard
                        id={folderId}
                        title={localTitle}
                        count={
                            folder.chunks?.length ||
                            folder.preview_items?.length ||
                            0
                        }
                        isEmpty={!previewItems || previewItems.length === 0}
                        isOuterStack={false}
                        onUpdateTitle={handleUpdateTitle}
                        {...(!previewItems || previewItems.length === 0
                            ? { onDelete: handleDeleteFolder }
                            : {})}
                        onSingleClick={() => {
                            if (isDraggingRef.current) return;
                            if (isExpanded && onExpand) onExpand();
                        }}
                        onDoubleClick={() => {
                            if (isDraggingRef.current) return;
                            if (isExpanded && onExpand) onExpand();
                        }}
                    >
                        {previewItems
                            .slice(0, 4)
                            .map((child: any, idx: number) => {
                                let mediaUrl =
                                    child.cover_media ||
                                    child.cover_image ||
                                    child.image_url ||
                                    child.media_url ||
                                    child.thumbnail_url;

                                if (
                                    !mediaUrl &&
                                    (child.text || child.content)
                                ) {
                                    const imgMatch = (
                                        child.text || child.content
                                    ).match(/<img[^>]+src="([^">]+)"/);
                                    if (imgMatch && imgMatch[1]) {
                                        mediaUrl = imgMatch[1];
                                    }
                                }

                                return (
                                    <BinderCoverPreview
                                        key={child.chunk_id || idx}
                                        title={
                                            child.title ||
                                            child.bridge ||
                                            "Untitled"
                                        }
                                        coverMedia={mediaUrl}
                                        orientation="portrait"
                                    />
                                );
                            })}
                    </ArchiveFolderCard>
                </motion.div>
            </motion.div>
        );
    },
);

export default SpatialFolderCard;
