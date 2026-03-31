import React, {
    useState,
    useRef,
    useMemo,
    useEffect,
    useCallback,
} from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import {
    XMarkIcon,
    ArrowsRightLeftIcon,
    PlusIcon,
} from "@heroicons/react/24/outline";

import SpatialCard from "./SpatialCard";
import PrimaryViewerCard from "./PrimaryViewerCard";
import { getGridAnimationProps } from "../../../../hooks/appTools/useGridLayout";
import UniversalCoverMedia from "../media/UniversalCoverMedia";
import SpatialFolderCard from "./SpatialArchiveFolderInner";
import FocusedReadingWorkspace, {
    buildSavedDerivedPanelsBySourceId,
} from "../../shared/FocusedReadingWorkspace";

// --- REFACTORED ISOLATED HOOKS ---
import useOrbitingItems from "../hooks/useOrbitingItems";
import useStackLayoutMap from "../hooks/useStackLayoutMap";
import useQuickThoughts, { getRealId } from "../hooks/useQuickThoughts";
import useCoverStickies from "../hooks/useCoverStickies";
import { buildApiUrl } from "../../../../lib/runtimeConfig";
import useIsTouchDevice from "../../../../hooks/appTools/useIsTouchDevice";

const SpatialStack = React.memo(
    ({
        itemId,
        cullingRect,
        isVisible: isRootVisible,
        cluster,
        noteStack,
        allGroups,
        clusterIndex,
        initialX,
        initialY,
        gridOffsetX,
        gridOffsetY,
        isExpanded,
        canvasScale,
        canvasMode,
        onToggleStack,
        fetchNotesForGroup,
        currentNotes,
        globalNotes,
        allClusters,
        isBeingArchived,
        animatingArchive,
        isBeingUnarchived,
        unarchivingSource,
        bringToFrontGrid,
        updateGridPosition,
        isBeingGridded,
        gridAnimationTargets,
        spatialMetadata,
        selectedItemIds = [],
        onOrbitLayoutUpdate,
        onFocusNote,
        drillDownPath = [],
        onDrillDown,
        onDrillUp,
        isMergeMode,
        onAppendToArchive,
        archiveStateByItemId,
        archiveGroupsById,
        archiveGroupsByDisplayParentId,
        groupContentsById,
        echoesById, // <--- NEW
        notesByLinkedEchoId, // <--- NEW
        linkedEchoIdsByNoteId,
        linkSummaryByItemId,
        onOpenMindMap,
        groupsByOwnerId,
        interactionReduced,
    }: any) => {
        const isNotesMode = canvasMode === "NOTES";
        const isTouchDevice = useIsTouchDevice();

        const dragDeltaX = useMotionValue(0);
        const dragDeltaY = useMotionValue(0);

        const [localPos, setLocalPos] = useState({
            x: initialX,
            y: initialY,
        });

        useEffect(() => {
            setLocalPos({ x: initialX, y: initialY });
        }, [initialX, initialY]);

        const currentExpandedId =
            drillDownPath?.length > 0
                ? drillDownPath[drillDownPath.length - 1]
                : itemId;

        const [activeFolder, setActiveFolder] = useState<any>(null);
        const [activeNode, setActiveNode] = useState<any>(null);
        const [maximizedReaderState, setMaximizedReaderState] = useState<{
            itemId: string;
            items: any[];
        } | null>(null);
        const [pageIndex, setPageIndex] = useState(0);

        const [primarySizeOffset, setPrimarySizeOffset] = useState({
            w: 0,
            h: 0,
        });
        const stackTitle = isNotesMode ? noteStack?.title : cluster?.title;
        const [stackRotation, setStackRotation] = useState(0);
        const stackActionVisibility = isTouchDevice
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100";

        const prevPathRef = useRef<string[]>(drillDownPath || []);

        useEffect(() => {
            const currentPath = drillDownPath || [];
            const pathChanged =
                prevPathRef.current.join(",") !== currentPath.join(",");
            prevPathRef.current = currentPath;

            // If the user just clicked a card (path didn't change), ABORT! Don't clear the active node!
            if (!isNotesMode || !pathChanged) return;
            const isVault = itemId === "GLOBAL_ARCHIVE_VAULT";
            const depth = drillDownPath.length;

            if (depth <= 1) {
                if (activeFolder) setActiveFolder(null);
                if (
                    activeNode &&
                    (activeNode.type === "folder" ||
                        activeNode.is_folder ||
                        activeNode.relation === "Folder")
                ) {
                    setActiveNode(null);
                }
                return;
            }

            if (isVault) {
                const binderId = drillDownPath[1];
                if (
                    !activeFolder ||
                    String(
                        activeFolder.stack_id ||
                            activeFolder.id ||
                            activeFolder.group_id,
                    ) !== String(binderId)
                ) {
                    const vaultChild = noteStack?.chunks?.find(
                        (c: any) =>
                            String(c.stack_id) === String(binderId) ||
                            String(c.group_id) === String(binderId) ||
                            String(c.id) === String(binderId),
                    );
                    if (vaultChild) setActiveFolder(vaultChild);
                }

                if (depth === 3) {
                    const slotId = drillDownPath[2];
                    if (
                        !activeNode ||
                        String(activeNode.group_id || activeNode.id) !==
                            String(slotId)
                    ) {
                        let slotNode = allGroups?.find(
                            (g: any) => String(g.group_id) === String(slotId),
                        );
                        if (!slotNode)
                            slotNode = allClusters?.find(
                                (c: any) => String(c.id) === String(slotId),
                            );
                        if (slotNode) setActiveNode(slotNode);
                    }
                } else if (depth < 3 && activeNode) {
                    if (
                        activeNode.type === "folder" ||
                        activeNode.is_folder ||
                        activeNode.relation === "Folder"
                    ) {
                        setActiveNode(null);
                    }
                }
            } else {
                const targetGroupId = drillDownPath[drillDownPath.length - 1];
                if (
                    !activeFolder ||
                    String(activeFolder.group_id) !== String(targetGroupId)
                ) {
                    const folder = allGroups?.find(
                        (g: any) =>
                            String(g.group_id) === String(targetGroupId),
                    );
                    if (folder) {
                        setActiveFolder(folder);
                        if (fetchNotesForGroup)
                            fetchNotesForGroup(targetGroupId);
                    }
                }
            }
        }, [
            isNotesMode,
            drillDownPath,
            allGroups,
            allClusters,
            noteStack,
            itemId,
            activeFolder,
            activeNode,
            fetchNotesForGroup,
        ]);

        const isDraggingRef = useRef(false);
        const [isDraggingRoot, setIsDraggingRoot] = useState(false);
        const reducedVisuals = interactionReduced || isDraggingRoot;

        const handleStackToggle = useCallback(() => {
            if (isDraggingRef.current) return;
            onToggleStack(itemId);
        }, [itemId, onToggleStack]);

        const handleCardExpand = useCallback(
            (node: any) => {
                handleStackToggle();
                if (!isNotesMode) setActiveNode(node);
            },
            [handleStackToggle, isNotesMode],
        );

        const handleCardSetActive = useCallback(
            (node: any) => {
                if (
                    itemId === "GLOBAL_ARCHIVE_VAULT" &&
                    drillDownPath?.length === 2 &&
                    node.type === "folder"
                ) {
                    if (onDrillDown)
                        onDrillDown(node.chunk_id || node.group_id);
                    return;
                }

                if (isNotesMode && !activeFolder && node.type === "folder") {
                    if (onDrillDown)
                        onDrillDown(node.chunk_id || node.group_id);
                    return;
                }

                setActiveNode(node);
            },
            [isNotesMode, activeFolder, itemId, drillDownPath, onDrillDown],
        );

        const unarchiveOrigin =
            isBeingUnarchived && unarchivingSource
                ? { x: unarchivingSource.x, y: unarchivingSource.y }
                : null;

        const orbitingItems =
            useOrbitingItems({
                isNotesMode,
                activeFolder,
                cluster,
                noteStack,
                drillDownPath,
                itemId,
                archiveGroupsById,
                archiveGroupsByDisplayParentId,
                archiveStateByItemId,
                groupContentsById,
                echoesById, // <--- NEW
                notesByLinkedEchoId, // <--- NEW
                linkedEchoIdsByNoteId,
                groupsByOwnerId,
            }) || [];

        const { activeThoughts, handleModifyThought, handleAddQuickThought } =
            useQuickThoughts(orbitingItems);

        const selectedItemIdSet = useMemo(
            () => new Set(selectedItemIds || []),
            [selectedItemIds],
        );

        const currentActiveNode =
            activeNode || (isNotesMode ? null : orbitingItems[0]) || null;
        const currentDirection = clusterIndex % 2 === 0 ? "LEFT" : "RIGHT";
        const readingItems = useMemo(
            () =>
                orbitingItems
                    .filter((item: any) => !item.is_folder && !item.is_quick_thought)
                    .map((item: any) => ({
                        id: String(
                            item.echo_id ||
                                item.note_id ||
                                item.chunk_id ||
                                item.id ||
                                "",
                        ),
                        title:
                            item.title ||
                            item.bridge ||
                            activeFolder?.title ||
                            stackTitle ||
                            "Focused Item",
                        text: String(
                            item.text ||
                                item.content ||
                                item.ai_insight ||
                                item.bridge ||
                                "",
                        ),
                        fullText: String(item.full_text || ""),
                        chapter: String(item.chapter || item.relation || ""),
                        sourceLabel: String(
                            item.filename ||
                                activeFolder?.title ||
                                stackTitle ||
                                "",
                        ),
                        filename: String(item.filename || ""),
                        chunkId: String(item.chunk_id || ""),
                        echoId: String(item.echo_id || ""),
                        clusterId: String(
                            cluster?.id || item.cluster_id || item.parent_cluster_id || "",
                        ),
                        sourceAnchorId: String(
                            cluster?.id || item.cluster_id || item.parent_cluster_id || "",
                        ),
                        bookId: String(cluster?.book_id || stackTitle || ""),
                        libraryId: String(cluster?.library_id || ""),
                        kind: item.note_id ? "note" : "echo",
                    }))
                    .filter((item: any) => item.id && item.text),
            [activeFolder?.title, cluster?.book_id, cluster?.id, cluster?.library_id, orbitingItems, stackTitle],
        );
        const buildWorkspaceItemFromNode = useCallback(
            (item: any) => {
                const itemId = String(
                    item?.echo_id || item?.note_id || item?.chunk_id || item?.id || "",
                );
                const itemText = String(
                    item?.text ||
                        item?.content ||
                        item?.ai_insight ||
                        item?.bridge ||
                        "",
                );
                if (!itemId || !itemText) return null;

                return {
                    id: itemId,
                    title:
                        item?.title ||
                        item?.bridge ||
                        activeFolder?.title ||
                        stackTitle ||
                        "Focused Item",
                    text: itemText,
                    fullText: String(item?.full_text || ""),
                    chapter: String(item?.chapter || item?.relation || ""),
                    sourceLabel: String(
                        item?.filename || activeFolder?.title || stackTitle || "",
                    ),
                    filename: String(item?.filename || ""),
                    chunkId: String(item?.chunk_id || ""),
                    echoId: String(item?.echo_id || ""),
                    clusterId: String(
                        cluster?.id || item?.cluster_id || item?.parent_cluster_id || "",
                    ),
                    sourceAnchorId: String(
                        cluster?.id || item?.cluster_id || item?.parent_cluster_id || "",
                    ),
                    bookId: String(cluster?.book_id || stackTitle || ""),
                    libraryId: String(cluster?.library_id || ""),
                    kind: item?.note_id ? "note" : "echo",
                };
            },
            [activeFolder?.title, cluster?.book_id, cluster?.id, cluster?.library_id, stackTitle],
        );
        const openMaximizedReader = useCallback(() => {
            const fallbackItem = buildWorkspaceItemFromNode(currentActiveNode);
            const workspaceItems =
                readingItems.length > 0
                    ? readingItems
                    : fallbackItem
                      ? [fallbackItem]
                      : [];

            if (!workspaceItems.length) return;

            const preferredId = String(
                currentActiveNode?.echo_id ||
                    currentActiveNode?.note_id ||
                    currentActiveNode?.chunk_id ||
                    currentActiveNode?.id ||
                    workspaceItems[0]?.id ||
                    "",
            );
            const resolvedItemId =
                workspaceItems.find(
                    (item: any) => String(item.id) === String(preferredId),
                )?.id || workspaceItems[0]?.id;

            if (!resolvedItemId) return;

            setMaximizedReaderState({
                itemId: String(resolvedItemId),
                items: workspaceItems,
            });
        }, [buildWorkspaceItemFromNode, currentActiveNode, readingItems]);
        const savedPanelsBySourceId = useMemo(
            () => buildSavedDerivedPanelsBySourceId(allClusters || []),
            [allClusters],
        );

        const currentWorldX = localPos.x + (gridOffsetX || 0);
        const currentWorldY = localPos.y + (gridOffsetY || 0);
        const isVisible =
            isRootVisible ??
            ((currentWorldX > (cullingRect?.left || -5000) &&
                currentWorldX < (cullingRect?.right || 5000) &&
                currentWorldY > (cullingRect?.top || -5000) &&
                currentWorldY < (cullingRect?.bottom || 5000)));

        const coverStickies = useCoverStickies(
            orbitingItems,
            isExpanded,
            isVisible,
        );

        const [localZOrder, setLocalZOrder] = useState<string[]>([]);
        const bringCardToFront = useCallback((cardId: string) => {
            setLocalZOrder((prev) => {
                const filtered = prev.filter((id) => id !== cardId);
                return [...filtered, cardId];
            });
        }, []);

        const allItemsToRender = useMemo(() => {
            if (!isVisible) return [];

            const limited = isExpanded
                ? orbitingItems.slice(pageIndex * 12, (pageIndex + 1) * 12)
                : orbitingItems.slice(0, 2);

            const thoughts: any[] = [];

            limited.forEach((item: any) => {
                const parentId = getRealId(item);
                const parentType =
                    item.type ||
                    (item.relation?.includes("Note") ? "note" : "echo");

                let parsed = [];
                try {
                    parsed = item.quick_thoughts
                        ? JSON.parse(item.quick_thoughts)
                        : [];
                } catch (e) {}

                const thoughtsToUse =
                    activeThoughts[parentId] !== undefined
                        ? activeThoughts[parentId]
                        : parsed;

                thoughtsToUse.forEach((qt: any) => {
                    thoughts.push({
                        ...qt,
                        chunk_id: `qt-${parentId}-${qt.id}`,
                        parent_id: parentId,
                        parent_type: parentType,
                        is_quick_thought: true,
                    });
                });
            });

            return [...limited, ...thoughts];
        }, [orbitingItems, pageIndex, activeThoughts, isVisible, isExpanded]);

        const [manualSlots, setManualSlots] = useState<
            Record<string, { x: number; y: number }>
        >({});

        useEffect(() => {
            const liveIds = new Set(
                allItemsToRender.map(
                    (item: any, index: number) =>
                        item.echo_id ||
                        item.note_id ||
                        item.chunk_id ||
                        item.id ||
                        `idx-${index}`,
                ),
            );

            setManualSlots((prev) => {
                const next = Object.fromEntries(
                    Object.entries(prev).filter(([id]) => liveIds.has(id)),
                );
                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(next);
                const isSame =
                    prevKeys.length === nextKeys.length &&
                    prevKeys.every((key) => nextKeys.includes(key));
                return isSame ? prev : next;
            });

            setLocalZOrder((prev) => prev.filter((id) => liveIds.has(id)));
        }, [allItemsToRender]);

        const currentLayoutMap = useStackLayoutMap({
            isExpanded,
            isNotesMode,
            noteStack,
            cluster,
            allItemsToRender,
            canvasMode,
            manualSlots,
            spatialMetadata,
            currentExpandedId,
            currentDirection,
            primarySizeOffset,
            itemId,
            localZOrder,
        });

        useEffect(() => {
            if (isExpanded && onOrbitLayoutUpdate) {
                onOrbitLayoutUpdate(currentLayoutMap);
            }
        }, [currentLayoutMap, isExpanded, onOrbitLayoutUpdate]);

        // --- RESTORED INLINE TAGS UPDATE ---
        const handleTagsUpdateStable = useCallback(
            async (id: string, newTagsString: string, type: string) => {
                try {
                    const response = await fetch(
                        buildApiUrl("/brain/tags/update"),
                        {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                item_id: id,
                                tags: newTagsString,
                                item_type: type,
                            }),
                        },
                    );
                    if (!response.ok) {
                        console.error(
                            `Failed to save sticky to ${type}. Status:`,
                            response.status,
                        );
                    }
                } catch (error) {
                    console.error(
                        "Network error while saving sticky note:",
                        error,
                    );
                }
            },
            [],
        );

        const getArchiveTargetIdFromPointer = useCallback((event: any) => {
            const clientX =
                event?.clientX ?? event?.changedTouches?.[0]?.clientX ?? null;
            const clientY =
                event?.clientY ?? event?.changedTouches?.[0]?.clientY ?? null;

            if (clientX === null || clientY === null) return null;

            const archiveNode = document
                .elementsFromPoint(clientX, clientY)
                .find((el) => el.hasAttribute("data-archive-id"));

            return archiveNode?.getAttribute("data-archive-id") || null;
        }, []);

        const resolvedX = localPos.x + (gridOffsetX || 0);
        const resolvedY = localPos.y + (gridOffsetY || 0);

        const finalSnapPos = gridAnimationTargets
            ? gridAnimationTargets[itemId]
            : undefined;
        const targetX = finalSnapPos
            ? finalSnapPos.x + (gridOffsetX || 0)
            : undefined;
        const targetY = finalSnapPos
            ? finalSnapPos.y + (gridOffsetY || 0)
            : undefined;

        const { animate, transition } = getGridAnimationProps(
            isBeingGridded,
            resolvedX,
            resolvedY,
            targetX,
            targetY,
            true,
        );

        return (
            <>
            <motion.div
                drag={!isExpanded}
                dragElastic={0}
                dragMomentum={false}
                onDragStart={() => {
                    isDraggingRef.current = true;
                    setIsDraggingRoot(true);
                    if (bringToFrontGrid) bringToFrontGrid(itemId);
                }}
                onDragEnd={(event, info) => {
                    if (isMergeMode) {
                        const targetArchiveId =
                            getArchiveTargetIdFromPointer(event);
                        if (targetArchiveId && onAppendToArchive) {
                            const isBulk =
                                selectedItemIds?.includes(itemId) &&
                                selectedItemIds.length > 1;
                            onAppendToArchive(
                                targetArchiveId,
                                isBulk ? selectedItemIds : [itemId],
                            );
                            setTimeout(() => {
                                isDraggingRef.current = false;
                                setIsDraggingRoot(false);
                            }, 150);
                            return;
                        }
                    }

                    const newX = localPos.x + info.offset.x;
                    const newY = localPos.y + info.offset.y;
                    setLocalPos({ x: newX, y: newY });
                    if (updateGridPosition)
                        updateGridPosition(itemId, newX, newY);

                    setTimeout(() => {
                        isDraggingRef.current = false;
                        setIsDraggingRoot(false);
                    }, 150);
                }}
                initial={
                    isBeingUnarchived && unarchiveOrigin
                        ? {
                              x: unarchiveOrigin.x,
                              y: unarchiveOrigin.y,
                              scale: 0.5,
                              opacity: 0,
                          }
                        : { x: initialX, y: initialY }
                }
                animate={animate}
                transition={transition as any}
                className={`absolute no-pan ${
                    reducedVisuals ? "canvas-interaction-reduced" : ""
                }`}
                style={{
                    zIndex: isExpanded ? 5000 : 10,
                    willChange: "transform",
                }}
            >
                {isVisible && (
                    <>
                        {!isExpanded && (
                            <div className="absolute top-0 left-0 pointer-events-none group">
                                {(() => {
                                    const zLayers = [
                                        [30, 20, 10],
                                        [10, 30, 20],
                                        [20, 10, 30],
                                    ];

                                    const currentLayerSet = zLayers[
                                        stackRotation
                                    ] ?? [30, 20, 10];
                                    const [coverZ, bg1Z, bg2Z] =
                                        currentLayerSet;
                                    const isStackSelected =
                                        selectedItemIdSet.has(itemId);

                                    return (
                                        <>
                                            {orbitingItems
                                                .slice(0, 2)
                                                .map((item: any, i: number) => {
                                                    const currentZ =
                                                        i === 0 ? bg1Z : bg2Z;
                                                    return (
                                                        <div
                                                            key={`bg-${item.chunk_id || i}`}
                                                            className="absolute inset-0 pointer-events-none transition-transform duration-300"
                                                            style={{
                                                                zIndex: currentZ,
                                                            }}
                                                        >
                                                            <div
                                                                className="pointer-events-auto h-full w-full"
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    handleStackToggle();
                                                                }}
                                                            >
                                                                {item.is_folder ? (
                                                                    <SpatialFolderCard
                                                                        folder={
                                                                            item
                                                                        }
                                                                        index={
                                                                            i
                                                                        }
                                                                        total={
                                                                            2
                                                                        }
                                                                        previewItems={
                                                                            item.preview_items ||
                                                                            item.chunks ||
                                                                            []
                                                                        }
                                                                        isExpanded={
                                                                            false
                                                                        }
                                                                        isActive={
                                                                            false
                                                                        }
                                                                        enginePos={{
                                                                            x: 0,
                                                                            y: 0,
                                                                        }}
                                                                        canvasScale={
                                                                            canvasScale
                                                                        }
                                                                        isSelected={
                                                                            false
                                                                        }
                                                                        selectedItemIds={[]}
                                                                        interactionReduced={
                                                                            reducedVisuals
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <SpatialCard
                                                                        chunk={
                                                                            item
                                                                        }
                                                                        index={
                                                                            i
                                                                        }
                                                                        isExpanded={
                                                                            false
                                                                        }
                                                                        canvasScale={
                                                                            canvasScale
                                                                        }
                                                                        hideStickies={
                                                                            true
                                                                        }
                                                                        interactionReduced={
                                                                            reducedVisuals
                                                                        }
                                                                        enginePos={{
                                                                            x: 0,
                                                                            y: 0,
                                                                        }}
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                            <div
                                                className={`absolute top-0 left-0 w-[350px] h-[480px] rounded-4xl bg-white shadow-2xl border cursor-pointer pointer-events-auto transition-transform duration-300 canvas-heavy-shell ${
                                                    isStackSelected
                                                        ? "ring-1 ring-green-400 border-green-400 z-[999]"
                                                        : "border-slate-200"
                                                }`}
                                                style={{
                                                    zIndex: coverZ,
                                                    transform:
                                                        "translate(-50%, -50%)",
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStackToggle();
                                                }}
                                            >
                                                <div className="absolute inset-0 rounded-[inherit] overflow-hidden canvas-heavy-media">
                                                    {cluster?.cover_media ||
                                                    noteStack?.cover_image ? (
                                                        <>
                                                            <UniversalCoverMedia
                                                                url={
                                                                    cluster?.cover_media ||
                                                                    noteStack?.cover_image
                                                                }
                                                            />
                                                            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
                                                        </>
                                                    ) : (
                                                        <div className="absolute inset-0 bg-white rounded-[inherit] p-8 pt-16 flex flex-col canvas-heavy-shell">
                                                            <ul className="flex-1 overflow-hidden flex flex-col gap-5">
                                                                {orbitingItems
                                                                    .slice(0, 5)
                                                                    .map(
                                                                        (
                                                                            item: any,
                                                                            idx: number,
                                                                        ) => (
                                                                            <div>
                                                                                <h4 className="font-bold text-slate-700 text-sm leading-snug">
                                                                                    {item.title ||
                                                                                        item.bridge ||
                                                                                        "Untitled"}
                                                                                </h4>
                                                                            </div>
                                                                        ),
                                                                    )}
                                                                {orbitingItems.length ===
                                                                    0 && (
                                                                    <li className="text-slate-400 italic text-sm py-4">
                                                                        Stack is
                                                                        empty.
                                                                    </li>
                                                                )}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>

                                                {coverStickies
                                                    .slice(0, 4)
                                                    .map(
                                                        (
                                                            sticky: any,
                                                            i: number,
                                                        ) => {
                                                            const cornerStyles =
                                                                [
                                                                    {
                                                                        top: -15,
                                                                        right: -40,
                                                                        transform:
                                                                            "rotate(6deg)",
                                                                        left: "auto",
                                                                        bottom: "auto",
                                                                    },
                                                                    {
                                                                        bottom: -30,
                                                                        left: -50,
                                                                        transform:
                                                                            "rotate(-12deg)",
                                                                        top: "auto",
                                                                        right: "auto",
                                                                    },
                                                                    {
                                                                        top: -25,
                                                                        left: -35,
                                                                        transform:
                                                                            "rotate(-8deg)",
                                                                        right: "auto",
                                                                        bottom: "auto",
                                                                    },
                                                                    {
                                                                        bottom: -15,
                                                                        right: -50,
                                                                        transform:
                                                                            "rotate(6deg)",
                                                                        left: "auto",
                                                                        top: "auto",
                                                                    },
                                                                ];
                                                            const colorClasses =
                                                                (
                                                                    sticky.styleClass ||
                                                                    ""
                                                                ).replace(
                                                                    /(top|bottom|left|right)-\[.*?\]|-?rotate-\d+/g,
                                                                    "",
                                                                );
                                                            return (
                                                                <div
                                                                    key={
                                                                        sticky.id ||
                                                                        i
                                                                    }
                                                                    className={`absolute w-28 h-28 p-3 shadow-md border z-[-1] pointer-events-none flex flex-col canvas-heavy-ornament ${colorClasses}`}
                                                                    style={
                                                                        cornerStyles[
                                                                            i
                                                                        ]
                                                                    }
                                                                >
                                                                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-50 mb-1 border-b border-black/10 pb-1">
                                                                        Sticky
                                                                        Note
                                                                    </span>
                                                                    <p className="w-full text-[10px] font-serif overflow-hidden leading-snug line-clamp-3">
                                                                        {
                                                                            sticky.text
                                                                        }
                                                                    </p>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                            </div>
                                        </>
                                    );
                                })()}

                                <div
                                    className={`absolute z-[9999] flex items-center gap-2 transition-opacity pointer-events-auto ${stackActionVisibility}`}
                                    style={{ top: "-224px", right: "-159px" }}
                                >
                                    <label
                                        className="cursor-pointer p-2 bg-white/90 hover:bg-slate-100   rounded-full text-slate-600 transition-transform hover:scale-110 border border-slate-200 shadow-sm"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Add Cover Media"
                                    >
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*,video/*,audio/*"
                                            onChange={async (e) => {
                                                e.stopPropagation();
                                                if (!e.target.files?.[0])
                                                    return;
                                                const formData = new FormData();
                                                formData.append(
                                                    "file",
                                                    e.target.files[0],
                                                );
                                                const targetId = isNotesMode
                                                    ? noteStack.stack_id
                                                    : cluster.id;
                                                const endpoint = isNotesMode
                                                    ? "stack"
                                                    : "cluster";
                                                await fetch(
                                                    buildApiUrl(
                                                        `/upload/media/${endpoint}/${targetId}`,
                                                    ),
                                                    {
                                                        method: "POST",
                                                        body: formData,
                                                    },
                                                );
                                            }}
                                        />
                                        <PlusIcon className="w-5 h-5" />
                                    </label>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setStackRotation(
                                                (prev) => (prev + 1) % 3,
                                            );
                                        }}
                                        className="p-2 bg-white/90 hover:bg-slate-100   rounded-full text-slate-600 transition-transform hover:scale-110 border border-slate-200 shadow-sm"
                                        title="Cycle Cards to Back"
                                    >
                                        <ArrowsRightLeftIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    key={
                                        isNotesMode && activeFolder
                                            ? activeFolder.title
                                            : stackTitle
                                    }
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="absolute pointer-events-none z-[2000]"
                                    style={{
                                        left:
                                            clusterIndex % 2 === 0 ? 360 : -360,
                                        top: 0,
                                        x: "-50%",
                                        y: "-50%",
                                        rotate:
                                            clusterIndex % 2 === 0 ? 90 : -90,
                                    }}
                                >
                                    <h2 className="text-6xl font-black text-slate-700/80 uppercase tracking-[0.15em] whitespace-nowrap">
                                        {isNotesMode && activeFolder
                                            ? activeFolder.title
                                            : stackTitle}
                                    </h2>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="relative">
                            {allItemsToRender.map(
                                (item: any, index: number) => {
                                    if (!isExpanded) return null;
                                    const cardId =
                                        item.echo_id ||
                                        item.note_id ||
                                        item.chunk_id ||
                                        `idx-${index}`;
                                    const safeKey = `${item.is_folder ? "folder" : "card"}-${cardId}`;

                                    const finalCardLayout =
                                        currentLayoutMap[cardId];
                                    const slotEnginePos = finalCardLayout
                                        ? {
                                              x: finalCardLayout.x,
                                              y: finalCardLayout.y,
                                          }
                                        : { x: 0, y: 0 };

                                    const finalZIndex =
                                        finalCardLayout?.z ??
                                        allItemsToRender.length - index;

                                    if (item.is_folder) {
                                        const previewChildren =
                                            item.preview_items ||
                                            item.chunks ||
                                            [];

                                        return (
                                            <SpatialFolderCard
                                                key={safeKey}
                                                folder={item}
                                                index={index}
                                                total={allItemsToRender.length}
                                                previewItems={previewChildren}
                                                isExpanded={isExpanded}
                                                isActive={
                                                    currentActiveNode?.chunk_id ===
                                                    item.chunk_id
                                                }
                                                enginePos={slotEnginePos}
                                                onSetActive={
                                                    handleCardSetActive
                                                }
                                                canvasScale={canvasScale}
                                                cardZIndex={finalZIndex}
                                                onInteract={() =>
                                                    bringCardToFront(cardId)
                                                }
                                                onExpand={() => {
                                                    setManualSlots({});
                                                    setPageIndex(0);
                                                    if (onDrillDown)
                                                        onDrillDown(
                                                            item.chunk_id,
                                                        );
                                                }}
                                                isSelected={selectedItemIdSet.has(
                                                    cardId,
                                                )}
                                                dragDeltaX={dragDeltaX}
                                                dragDeltaY={dragDeltaY}
                                                selectedItemIds={
                                                    selectedItemIds
                                                }
                                                selectedItemIdSet={
                                                    selectedItemIdSet
                                                }
                                                interactionReduced={
                                                    reducedVisuals
                                                }
                                                onDragEndCard={(
                                                    draggedId: string,
                                                    deltaX: number,
                                                    deltaY: number,
                                                    isBulk: boolean,
                                                    startPos: any,
                                                ) => {
                                                    if (isBulk) {
                                                        setManualSlots(
                                                            (prev: any) => {
                                                                const next = {
                                                                    ...prev,
                                                                };
                                                                selectedItemIds.forEach(
                                                                    (
                                                                        id: string,
                                                                    ) => {
                                                                        const originalPos =
                                                                            currentLayoutMap[
                                                                                id
                                                                            ];
                                                                        if (
                                                                            originalPos
                                                                        )
                                                                            next[
                                                                                id
                                                                            ] =
                                                                                {
                                                                                    x:
                                                                                        originalPos.x +
                                                                                        deltaX,
                                                                                    y:
                                                                                        originalPos.y +
                                                                                        deltaY,
                                                                                };
                                                                    },
                                                                );
                                                                return next;
                                                            },
                                                        );
                                                        setLocalZOrder(
                                                            (
                                                                prev: string[],
                                                            ) => {
                                                                const clean =
                                                                    prev.filter(
                                                                        (id) =>
                                                                            !selectedItemIdSet.has(
                                                                                id,
                                                                            ),
                                                                    );
                                                                return [
                                                                    ...clean,
                                                                    ...selectedItemIds,
                                                                ];
                                                            },
                                                        );
                                                    } else {
                                                        setManualSlots(
                                                            (prev: any) => ({
                                                                ...prev,
                                                                [draggedId]: {
                                                                    x:
                                                                        startPos.x +
                                                                        deltaX,
                                                                    y:
                                                                        startPos.y +
                                                                        deltaY,
                                                                },
                                                            }),
                                                        );
                                                        bringCardToFront(
                                                            draggedId,
                                                        );
                                                    }
                                                }}
                                            />
                                        );
                                    }

                                    return (
                                        <SpatialCard
                                            key={safeKey}
                                            chunk={item}
                                            index={index}
                                            total={allItemsToRender.length}
                                            isExpanded={isExpanded}
                                            isActive={
                                                currentActiveNode?.chunk_id ===
                                                item.chunk_id
                                            }
                                            enginePos={slotEnginePos}
                                            direction={currentDirection}
                                            canvasScale={canvasScale}
                                            primarySizeOffset={
                                                primarySizeOffset
                                            }
                                            canvasMode={canvasMode}
                                            onUpdateStickies={
                                                handleTagsUpdateStable
                                            }
                                            onModifyQuickThought={
                                                handleModifyThought
                                            }
                                            onExpand={handleCardExpand}
                                            onSetActive={handleCardSetActive}
                                            isSelected={selectedItemIdSet.has(
                                                cardId,
                                            )}
                                            cardZIndex={finalZIndex}
                                            onInteract={() =>
                                                bringCardToFront(cardId)
                                            }
                                            linkSummary={
                                                linkSummaryByItemId?.[cardId]
                                            }
                                            onOpenMindMap={onOpenMindMap}
                                            dragDeltaX={dragDeltaX}
                                            dragDeltaY={dragDeltaY}
                                            selectedItemIds={selectedItemIds}
                                            selectedItemIdSet={
                                                selectedItemIdSet
                                            }
                                            interactionReduced={
                                                reducedVisuals
                                            }
                                            onDragEndCard={(
                                                draggedId: string,
                                                deltaX: number,
                                                deltaY: number,
                                                isBulk: boolean,
                                                startPos: any,
                                                e: any,
                                            ) => {
                                                if (isMergeMode) {
                                                    const targetArchiveId =
                                                        getArchiveTargetIdFromPointer(
                                                            e,
                                                        );
                                                    if (
                                                        targetArchiveId &&
                                                        onAppendToArchive
                                                    ) {
                                                        onAppendToArchive(
                                                            targetArchiveId,
                                                            isBulk
                                                                ? selectedItemIds
                                                                : [draggedId],
                                                        );
                                                        return;
                                                    }
                                                }

                                                if (isBulk) {
                                                    setManualSlots(
                                                        (prev: any) => {
                                                            const next = {
                                                                ...prev,
                                                            };
                                                            selectedItemIds.forEach(
                                                                (
                                                                    id: string,
                                                                ) => {
                                                                    const originalPos =
                                                                        currentLayoutMap[
                                                                            id
                                                                        ];
                                                                    if (
                                                                        originalPos
                                                                    ) {
                                                                        next[
                                                                            id
                                                                        ] = {
                                                                            x:
                                                                                originalPos.x +
                                                                                deltaX,
                                                                            y:
                                                                                originalPos.y +
                                                                                deltaY,
                                                                        };
                                                                    }
                                                                },
                                                            );
                                                            return next;
                                                        },
                                                    );
                                                    setLocalZOrder(
                                                        (prev: string[]) => {
                                                            const clean =
                                                                prev.filter(
                                                                    (id) =>
                                                                        !selectedItemIdSet.has(
                                                                            id,
                                                                        ),
                                                                );
                                                            return [
                                                                ...clean,
                                                                ...selectedItemIds,
                                                            ];
                                                        },
                                                    );
                                                } else {
                                                    setManualSlots(
                                                        (prev: any) => ({
                                                            ...prev,
                                                            [draggedId]: {
                                                                x:
                                                                    startPos.x +
                                                                    deltaX,
                                                                y:
                                                                    startPos.y +
                                                                    deltaY,
                                                            },
                                                        }),
                                                    );
                                                    bringCardToFront(draggedId);
                                                }
                                            }}
                                        />
                                    );
                                },
                            )}

                            <PrimaryViewerCard
                                activeNode={
                                    currentActiveNode &&
                                    !(
                                        currentActiveNode.is_archive_node ||
                                        currentActiveNode.type ===
                                            "archive_folder" ||
                                        currentActiveNode.title
                                            ?.toLowerCase()
                                            .includes("archive")
                                    )
                                        ? currentActiveNode
                                        : activeFolder &&
                                            !(
                                                activeFolder.is_archive_node ||
                                                activeFolder.type ===
                                                    "archive_folder" ||
                                                activeFolder.title
                                                    ?.toLowerCase()
                                                    .includes("archive")
                                            )
                                          ? {
                                                ...activeFolder,
                                                relation: "Folder",
                                                type: "folder",
                                                title: activeFolder.title,
                                                chunk_id:
                                                    activeFolder.group_id ||
                                                    activeFolder.stack_id ||
                                                    activeFolder.id,
                                            }
                                          : isNotesMode && noteStack
                                            ? {
                                                  ...noteStack,
                                                  relation: "Stack",
                                                  type: "stack",
                                                  title: noteStack.title,
                                                  chunk_id: noteStack.stack_id,
                                                  cover_image:
                                                      noteStack.cover_image,
                                              }
                                            : cluster
                                              ? {
                                                    ...cluster,
                                                    relation: "Cluster",
                                                    type: "cluster",
                                                    title: cluster.title,
                                                    chunk_id: cluster.id,
                                                    cover_media:
                                                        cluster.cover_media,
                                                }
                                              : {}
                                }
                                globalNotes={globalNotes}
                                isExpanded={isExpanded}
                                canvasScale={canvasScale}
                                sizeOffset={primarySizeOffset}
                                setSizeOffset={setPrimarySizeOffset}
                                totalItems={orbitingItems.length}
                                pageIndex={pageIndex}
                                setPageIndex={setPageIndex}
                                direction={currentDirection}
                                onAddQuickThought={() =>
                                    handleAddQuickThought(currentActiveNode)
                                }
                                onFocusNote={onFocusNote}
                                onMaximizeReading={openMaximizedReader}
                                interactionReduced={reducedVisuals}
                            />
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setManualSlots({});

                                        if (
                                            drillDownPath.length > 1 &&
                                            onDrillUp
                                        ) {
                                            onDrillUp();
                                        } else if (
                                            isNotesMode &&
                                            activeFolder
                                        ) {
                                            setActiveFolder(null);
                                            setActiveNode(null);
                                        } else {
                                            handleStackToggle();
                                        }
                                    }}
                                    className="absolute -top-12 -right-12 z-[6000] p-4 bg-white text-slate-400 hover:text-red-600 rounded-full shadow-2xl border border-slate-100 transition-colors active:scale-90"
                                >
                                    {isNotesMode && activeFolder ? (
                                        <ArrowsRightLeftIcon className="w-6 h-6" />
                                    ) : (
                                        <XMarkIcon className="w-6 h-6" />
                                    )}
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </motion.div>
            {maximizedReaderState && maximizedReaderState.items.length > 0 && (
                <FocusedReadingWorkspace
                    workspaceTitle={stackTitle || "Focused Reading"}
                    workspaceSubtitle={
                        isNotesMode ? "Spatial notes focus" : "Spatial echo focus"
                    }
                    items={maximizedReaderState.items}
                    initialItemId={maximizedReaderState.itemId}
                    savedPanelsBySourceId={savedPanelsBySourceId}
                    onClose={() => setMaximizedReaderState(null)}
                />
            )}
            </>
        );
    },
);

export default SpatialStack;
