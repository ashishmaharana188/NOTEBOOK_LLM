import React, {
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
} from "react";
import { MotionConfig } from "framer-motion";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import axios from "axios";

import useNotes from "../../../hooks/noteManager/useNotes";
import useShiftKey from "../../../hooks/appTools/useMarquee";
import useGridLayout from "../../../hooks/appTools/useGridLayout";
import MarqueeSelector from "../../appTools/marqueeSelector/marqueeSelector";
import SelectionToolbar from "../../appTools/toolbar/selectionToolbar";
import SpatialArchiveFolder from "./components/SpatialArchiveFolderOuter";
import SpatialStack from "./components/SpatialStack";
import useCanvasCamera from "./hooks/useCanvasCamera";
import useCanvasData from "./hooks/useCanvasData";
import { notify } from "../../system/AppNotifications";
import { useRefreshBus } from "../../system/RefreshBusProvider";
import { buildApiUrl } from "../../../lib/runtimeConfig";
import useCanvasInteractionMode from "../../../hooks/appTools/useCanvasInteractionMode";

const TOUCH_SHIFT_HOLD_MS = 420;
const TOUCH_SHIFT_MOVE_TOLERANCE = 14;

type TouchPointLike = {
    identifier: number;
    clientX: number;
    clientY: number;
};

export default function SpatialCanvasUI({
    clusters,
    notes: globalNotes = [],
    manualLinks = [],
    fetchClusters,
    spatialMetadata = {},
    onFocusNote,
    onOpenMindMap,
}: {
    clusters: any[];
    notes?: any[];
    manualLinks?: any[];
    fetchClusters?: () => void;
    spatialMetadata?: Record<string, any>;
    onFocusNote?: (node: any) => void;
    onOpenMindMap?: (nodeId: string) => void;
}) {
    const {
        draftGridCoordinates,
        gridZIndexes,
        bringToFrontGrid,
        updateGridPosition,
        saveGrid,
        saveGridSet,
        animatingGridIds,
        gridAnimationTargets,
    } = useGridLayout();

    const [drillDownPath, setDrillDownPath] = useState<string[]>([]);
    const rootExpandedId = drillDownPath[0] || null;
    const currentExpandedId = drillDownPath[drillDownPath.length - 1] || null;
    const [canvasMode, setCanvasMode] = useState<"ECHO" | "NOTES">("ECHO");
    const { isInteracting, startInteraction, settleInteraction } =
        useCanvasInteractionMode(150);

    const [isShiftDown, setIsShiftDown] = useShiftKey();
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const selectedItemIdSet = useMemo(
        () => new Set(selectedItemIds),
        [selectedItemIds],
    );

    const [isMergeMode, setIsMergeMode] = useState(false);

    const activeOrbitLayoutRef = useRef<Record<string, any>>({});
    const archiveAnimationResetRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null);

    const [animatingArchive, setAnimatingArchive] = useState<{
        isActive: boolean;
        targetX: number;
        targetY: number;
        sourceIds: string[];
    } | null>(null);

    const [unarchivingSource, setUnarchivingSource] = useState<{
        x: number;
        y: number;
        sourceIds: string[];
    } | null>(null);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const touchShiftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const touchShiftSessionRef = useRef<{
        touchId: number;
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
        activated: boolean;
    } | null>(null);
    const [touchMarqueeBox, setTouchMarqueeBox] = useState<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
        startClientX: number;
        startClientY: number;
        endClientX: number;
        endClientY: number;
    } | null>(null);
    const [isTouchSelectionMode, setIsTouchSelectionMode] = useState(false);
    const touchMarqueeBoxRef = useRef<typeof touchMarqueeBox>(null);
    const suppressTouchClickUntilRef = useRef(0);

    const handleToggleStack = useCallback((itemId: string) => {
        setDrillDownPath((prev) =>
            prev[0] === itemId && prev.length === 1 ? [] : [itemId],
        );
    }, []);

    const handleDrillDown = useCallback((folderId: string | string[]) => {
        if (Array.isArray(folderId)) {
            setDrillDownPath(folderId);
        } else {
            setDrillDownPath((prev) => [...prev, folderId]);
        }
    }, []);

    const handleDrillUp = useCallback(() => {
        setDrillDownPath((prev) => prev.slice(0, -1));
    }, []);

    const {
        stacks,
        groups,
        currentNotes,
        fetchStacks,
        fetchGroups,
        fetchNotesForGroup,
    } = useNotes("spatialCanvas");
    const { publish } = useRefreshBus();

    useEffect(() => {
        fetchStacks();
        fetchGroups();
    }, []);

    useEffect(() => {
        if (canvasMode === "NOTES") {
            fetchStacks();
            fetchGroups();
        }
    }, [canvasMode, fetchStacks, fetchGroups]);

    useEffect(() => {
        // If the mode changes, or we drill into/out of a folder, wipe all active selections and layout drafts.
        setSelectedItemIds([]);

        setAnimatingArchive(null);
        setUnarchivingSource(null);
        activeOrbitLayoutRef.current = {};
    }, [canvasMode, currentExpandedId]);

    // --- AUTO-EVICTION: Prevent Ghost Vaults ---
    useEffect(() => {
        if (currentExpandedId && currentExpandedId !== rootExpandedId) {
            // ✨ THE FIX: Check all arrays to ensure we don't accidentally kick the user out of valid Stacks or Clusters!
            const folderStillExists =
                groups.some(
                    (g: any) =>
                        String(g.group_id) === String(currentExpandedId),
                ) ||
                (stacks || []).some(
                    (s: any) =>
                        String(s.stack_id) === String(currentExpandedId),
                ) ||
                (clusters || []).some(
                    (c: any) => String(c.id) === String(currentExpandedId),
                );

            if (!folderStillExists) {
                handleDrillUp();
            }
        }
    }, [
        groups,
        stacks,
        clusters,
        currentExpandedId,
        rootExpandedId,
        handleDrillUp,
    ]);

    const {
        rawLoopDataset = [],
        loopDataset = [],
        clustersById = {},
        stacksById = {},
        groupsById = {},
        archiveGroupsById = {},
        archiveGroupsByDisplayParentId = {},
        archiveStateByItemId = {},
        archiveContextByItemId = {},
        groupByItemId = {},
        groupContentsById = {},
        echoesById = {}, // <--- NEW
        notesById = {},
        notesByLinkedEchoId = {}, // <--- NEW
        linkedEchoIdsByNoteId = {},
        manualLinkKeySet = new Set<string>(),
        linkSummaryByItemId = {},
        groupsByOwnerId = {}, // <--- NEW
    } = useCanvasData(
        canvasMode,
        clusters,
        stacks,
        groups,
        globalNotes,
        manualLinks,
        rootExpandedId,
    );

    const updateActiveOrbitLayout = useCallback(
        (nextLayout: Record<string, any>) => {
            activeOrbitLayoutRef.current = nextLayout || {};
        },
        [],
    );

    const clearArchiveAnimationReset = useCallback(() => {
        if (archiveAnimationResetRef.current) {
            clearTimeout(archiveAnimationResetRef.current);
            archiveAnimationResetRef.current = null;
        }
    }, []);

    const scheduleArchiveAnimationReset = useCallback(() => {
        clearArchiveAnimationReset();
        archiveAnimationResetRef.current = setTimeout(() => {
            setAnimatingArchive(null);
            archiveAnimationResetRef.current = null;
        }, 500);
    }, [clearArchiveAnimationReset]);

    useEffect(() => clearArchiveAnimationReset, [clearArchiveAnimationReset]);

    const knownCanvasItemIds = useMemo(() => {
        const ids = new Set<string>([
            ...Object.keys(clustersById),
            ...Object.keys(stacksById),
            ...Object.keys(groupsById),
            ...Object.keys(archiveGroupsById),
            ...Object.keys(echoesById),
            ...Object.keys(notesById),
            "GLOBAL_ARCHIVE_VAULT",
        ]);

        rawLoopDataset.forEach((item: any) => {
            const itemId = String(
                item.id || item.stack_id || item.group_id || "",
            );
            if (itemId) ids.add(itemId);
        });
        loopDataset.forEach((item: any) => {
            const itemId = String(
                item.id || item.stack_id || item.group_id || "",
            );
            if (itemId) ids.add(itemId);
            (item.chunks || []).forEach((child: any) => {
                const childId = String(
                    child.id ||
                        child.stack_id ||
                        child.group_id ||
                        child.note_id ||
                        child.echo_id ||
                        child.chunk_id ||
                        "",
                );
                if (childId) ids.add(childId);
            });
        });

        return ids;
    }, [
        archiveGroupsById,
        clustersById,
        echoesById,
        groupsById,
        loopDataset,
        notesById,
        rawLoopDataset,
        stacksById,
    ]);

    const validDrillPathIds = useMemo(
        () =>
            new Set<string>([
                ...Object.keys(clustersById),
                ...Object.keys(stacksById),
                ...Object.keys(groupsById),
                ...Object.keys(archiveGroupsById),
                "GLOBAL_ARCHIVE_VAULT",
            ]),
        [archiveGroupsById, clustersById, groupsById, stacksById],
    );

    const refreshCanvasViews = useCallback(
        async ({ refreshNotes = true }: { refreshNotes?: boolean } = {}) => {
            const refreshTasks: Promise<any>[] = [];
            if (typeof fetchStacks === "function") {
                refreshTasks.push(fetchStacks());
            }
            if (typeof fetchGroups === "function") {
                refreshTasks.push(fetchGroups());
            }
            if (
                refreshNotes &&
                currentExpandedId &&
                groupsById[currentExpandedId] &&
                groupsById[currentExpandedId]?.group_kind !== "archive" &&
                typeof fetchNotesForGroup === "function"
            ) {
                refreshTasks.push(fetchNotesForGroup(currentExpandedId));
            }

            publish(["canvas.snapshot"]);

            if (refreshTasks.length > 0) {
                await Promise.allSettled(refreshTasks);
            }
        },
        [
            currentExpandedId,
            fetchGroups,
            fetchNotesForGroup,
            fetchStacks,
            groupsById,
            publish,
        ],
    );

    const handleSaveWorkspaceNote = useCallback(
        async ({
            noteId,
            previousGroupId,
            groupId,
            title,
            content,
            tags,
        }: {
            noteId: string;
            previousGroupId: string;
            groupId: string;
            title: string;
            content: string;
            tags: string;
        }) => {
            if (!noteId) return;

            await axios.put(buildApiUrl("/notes/item/update"), {
                note_id: noteId,
                title,
                content,
                tags,
                group_id: groupId || "",
            });

            const refreshTasks: Promise<any>[] = [
                fetchStacks(),
                fetchGroups(),
            ];

            if (typeof fetchClusters === "function") {
                refreshTasks.push(Promise.resolve(fetchClusters()));
            }
            if (groupId) {
                refreshTasks.push(fetchNotesForGroup(groupId));
            }
            if (
                previousGroupId &&
                previousGroupId !== groupId
            ) {
                refreshTasks.push(fetchNotesForGroup(previousGroupId));
            }

            await Promise.allSettled(refreshTasks);

            publish(
                [
                    "canvas.snapshot",
                    "mindmap.graph",
                    groupId ? `notes.group:${groupId}` : "",
                    previousGroupId && previousGroupId !== groupId
                        ? `notes.group:${previousGroupId}`
                        : "",
                ].filter(Boolean) as string[],
            );
        },
        [
            fetchClusters,
            fetchGroups,
            fetchNotesForGroup,
            fetchStacks,
            publish,
        ],
    );

    useEffect(() => {
        setDrillDownPath((prev) => {
            if (!prev.length) return prev;
            const next: string[] = [];
            for (const rawId of prev) {
                const id = String(rawId || "");
                if (!id || !validDrillPathIds.has(id)) break;
                next.push(id);
            }
            return next.length === prev.length ? prev : next;
        });

        setSelectedItemIds((prev) => {
            const next = prev.filter((id) =>
                knownCanvasItemIds.has(String(id)),
            );
            return next.length === prev.length ? prev : next;
        });

        setAnimatingArchive((prev) => {
            if (!prev) return prev;
            const nextSourceIds = prev.sourceIds.filter((id) =>
                knownCanvasItemIds.has(String(id)),
            );
            if (nextSourceIds.length === 0) return null;
            return nextSourceIds.length === prev.sourceIds.length
                ? prev
                : { ...prev, sourceIds: nextSourceIds };
        });

        setUnarchivingSource((prev) => {
            if (!prev) return prev;
            const nextSourceIds = prev.sourceIds.filter((id) =>
                knownCanvasItemIds.has(String(id)),
            );
            if (nextSourceIds.length === 0) return null;
            return nextSourceIds.length === prev.sourceIds.length
                ? prev
                : { ...prev, sourceIds: nextSourceIds };
        });

        const currentLayout = activeOrbitLayoutRef.current || {};
        const prunedLayout = Object.fromEntries(
            Object.entries(currentLayout).filter(([id]) =>
                knownCanvasItemIds.has(id),
            ),
        );
        if (
            Object.keys(currentLayout).length !==
            Object.keys(prunedLayout).length
        ) {
            activeOrbitLayoutRef.current = prunedLayout;
        }
    }, [knownCanvasItemIds, validDrillPathIds]);

    const archiveFolderIds = useMemo(() => {
        const ids = new Set<string>(Object.keys(archiveGroupsById));

        rawLoopDataset.forEach((item: any) => {
            const itemId = String(item.id || item.stack_id || "");
            if (!itemId) return;
            if (
                item.is_archive_node ||
                item.is_inner ||
                item.group_kind === "archive" ||
                item.stack_id === "GLOBAL_ARCHIVE_VAULT"
            ) {
                ids.add(itemId);
            }
        });

        const vaultNode = loopDataset.find(
            (item: any) => item.stack_id === "GLOBAL_ARCHIVE_VAULT",
        );
        (vaultNode?.chunks || []).forEach((child: any) => {
            const childId = String(
                child.group_id || child.id || child.stack_id || "",
            );
            if (!childId) return;
            if (
                child.is_outer ||
                child.is_inner ||
                child.is_archive_node ||
                child.group_kind === "archive" ||
                child.type === "archive_folder"
            ) {
                ids.add(childId);
            }
        });

        return ids;
    }, [archiveGroupsById, rawLoopDataset, loopDataset]);

    const getArchiveBlockReason = useCallback(
        (itemIds: string[] = []) => {
            if (itemIds.some((id) => archiveFolderIds.has(String(id)))) {
                return "Archive folders cannot be archived again. Open the archive and select the slots or cards inside it instead.";
            }

            let hasEchoRelated = false;
            let hasNotesOnly = false;

            itemIds.forEach((id) => {
                if (
                    id.startsWith("cluster_") ||
                    id.startsWith("stack_") ||
                    archiveGroupsById[id] ||
                    groupsById[id]
                ) {
                    return;
                }

                const context = archiveContextByItemId[id];
                if (context === "echo_related") hasEchoRelated = true;
                if (context === "notes_only") hasNotesOnly = true;
            });

            if (hasEchoRelated && hasNotesOnly) {
                return "This selection mixes echo-related notes and notes-only notes. Archive them separately.";
            }

            return null;
        },
        [
            archiveContextByItemId,
            archiveGroupsById,
            groupsById,
            archiveFolderIds,
        ],
    );

    const archiveBlockedReason = useMemo(
        () => getArchiveBlockReason(selectedItemIds),
        [getArchiveBlockReason, selectedItemIds],
    );

    useEffect(() => {
        if (archiveBlockedReason && isMergeMode) {
            setIsMergeMode(false);
        }
    }, [archiveBlockedReason, isMergeMode, setIsMergeMode]);

    useEffect(() => {
        if (isMergeMode && selectedItemIds.length === 0) {
            setIsMergeMode(false);
        }
    }, [isMergeMode, selectedItemIds.length]);

    // --- CAMERA MANAGEMENT ---
    const {
        transformComponentRef,
        canvasScale,
        cameraPositionX,
        cameraPositionY,
        cullingRect,
        updateCulling,
    } = useCanvasCamera(canvasMode, loopDataset, spatialMetadata);

    useEffect(() => {
        touchMarqueeBoxRef.current = touchMarqueeBox;
    }, [touchMarqueeBox]);

    const clearTouchShiftTimer = useCallback(() => {
        if (touchShiftTimerRef.current) {
            clearTimeout(touchShiftTimerRef.current);
            touchShiftTimerRef.current = null;
        }
    }, []);

    const getCanvasPointFromClient = useCallback(
        (clientX: number, clientY: number) => {
            const rect = canvasViewportRef.current?.getBoundingClientRect();
            if (!rect) return null;

            return {
                x: (clientX - rect.left - cameraPositionX) / canvasScale,
                y: (clientY - rect.top - cameraPositionY) / canvasScale,
            };
        },
        [cameraPositionX, cameraPositionY, canvasScale],
    );

    const expandedIndex = loopDataset.findIndex(
        (item: any) =>
            (canvasMode === "ECHO" ? item.id : item.stack_id) ===
            rootExpandedId,
    );
    const expandedRow =
        expandedIndex !== -1 ? Math.floor(expandedIndex / 3) : -1;
    const expandedCol = expandedIndex !== -1 ? expandedIndex % 3 : -1;
    const animatingGridIdSet = useMemo(
        () => new Set((animatingGridIds || []).map((id) => String(id))),
        [animatingGridIds],
    );
    const animatingArchiveIdSet = useMemo(
        () =>
            new Set(
                (animatingArchive?.sourceIds || []).map((id) => String(id)),
            ),
        [animatingArchive],
    );
    const unarchivingSourceIdSet = useMemo(
        () =>
            new Set(
                (unarchivingSource?.sourceIds || []).map((id) => String(id)),
            ),
        [unarchivingSource],
    );
    const rootSceneItems = useMemo(
        () =>
            loopDataset.map((item: any, index: number) => {
                const row = Math.floor(index / 3);
                const col = index % 3;
                const itemId = String(
                    canvasMode === "ECHO" ? item.id : item.stack_id,
                );
                const savedMeta = spatialMetadata[itemId];
                const draftMeta = draftGridCoordinates[itemId];
                const defaultX = col * 600 + (row % 2 === 0 ? 0 : 300);
                const defaultY = row * 650;

                const baseX = draftMeta?.x ?? savedMeta?.x_coord ?? defaultX;
                const baseY = draftMeta?.y ?? savedMeta?.y_coord ?? defaultY;

                let gridOffsetX = 0;
                let gridOffsetY = 0;

                if (expandedIndex !== -1 && index !== expandedIndex) {
                    const colDiff = col - expandedCol;
                    const rowDiff = row - expandedRow;

                    if (colDiff < 0) gridOffsetX = -1200;
                    else if (colDiff > 0) gridOffsetX = 1200;

                    if (rowDiff < 0) gridOffsetY = -900;
                    else if (rowDiff > 0) gridOffsetY = 1600;
                }

                const worldX = baseX + gridOffsetX;
                const worldY = baseY + gridOffsetY;
                const isVisible =
                    worldX > cullingRect.left &&
                    worldX < cullingRect.right &&
                    worldY > cullingRect.top &&
                    worldY < cullingRect.bottom;

                return {
                    item,
                    index,
                    itemId,
                    savedMeta,
                    baseX,
                    baseY,
                    gridOffsetX,
                    gridOffsetY,
                    worldX,
                    worldY,
                    isVisible,
                };
            }),
        [
            canvasMode,
            cullingRect,
            draftGridCoordinates,
            expandedCol,
            expandedIndex,
            expandedRow,
            loopDataset,
            spatialMetadata,
        ],
    );
    const rootSceneItemById = useMemo(
        () =>
            new Map(
                rootSceneItems.map((entry) => [String(entry.itemId), entry]),
            ),
        [rootSceneItems],
    );
    const renderedRootSceneItems = useMemo(
        () =>
            rootSceneItems.filter(({ itemId, isVisible }) => {
                if (isVisible) return true;
                if (selectedItemIdSet.has(itemId)) return true;
                if (rootExpandedId && String(rootExpandedId) === itemId)
                    return true;
                if (animatingGridIdSet.has(itemId)) return true;
                if (animatingArchiveIdSet.has(itemId)) return true;
                if (unarchivingSourceIdSet.has(itemId)) return true;
                return false;
            }),
        [
            animatingArchiveIdSet,
            animatingGridIdSet,
            rootExpandedId,
            rootSceneItems,
            selectedItemIdSet,
            unarchivingSourceIdSet,
        ],
    );

    // --- NEW ELIGIBILITY CHECK ---
    const selectedArchiveEligibleIds = selectedItemIds.filter((id) => {
        // 1. Root items with an archive_group_id
        if (clustersById[id]?.archive_group_id) return true;
        if (stacksById[id]?.archive_group_id) return true;
        // 2. Explicit Archive Folders
        if (archiveGroupsById[id]) return true;
        // 3. Notes/Echoes with an inner or outer archive state
        if (
            archiveStateByItemId[id] === "inner" ||
            archiveStateByItemId[id] === "outer"
        )
            return true;

        return false;
    });

    const showUnarchive = selectedArchiveEligibleIds.length > 0;
    const hasFoldersSelected = selectedItemIds.some(
        (id) =>
            groups.some((g: any) => g.group_id === id) ||
            archiveFolderIds.has(String(id)),
    );

    const getManualLinkPairKey = useCallback(
        (leftId: string, rightId: string) => {
            return [String(leftId), String(rightId)].sort().join("::");
        },
        [],
    );

    const getRelationshipSelectionInfo = useCallback(
        (itemIds: string[] = []) => {
            const uniqueIds = Array.from(
                new Set((itemIds || []).map((id) => String(id || ""))),
            ).filter(Boolean);
            const invalidIds = uniqueIds.filter(
                (id) => !id.startsWith("note_") && !id.startsWith("echo_"),
            );
            const noteIds = uniqueIds.filter((id) => id.startsWith("note_"));
            const echoIds = uniqueIds.filter((id) => id.startsWith("echo_"));
            const pairKeys: string[] = [];

            for (let index = 0; index < noteIds.length; index += 1) {
                for (
                    let otherIndex = index + 1;
                    otherIndex < noteIds.length;
                    otherIndex += 1
                ) {
                    const sourceNoteId = noteIds[index];
                    const targetNoteId = noteIds[otherIndex];
                    if (!sourceNoteId || !targetNoteId) continue;
                    pairKeys.push(
                        getManualLinkPairKey(sourceNoteId, targetNoteId),
                    );
                }
            }

            noteIds.forEach((noteId) => {
                echoIds.forEach((echoId) => {
                    pairKeys.push(getManualLinkPairKey(noteId, echoId));
                });
            });

            let blockedReason = null;
            if (invalidIds.length > 0) {
                blockedReason =
                    "Only note and echo cards can participate in manual links.";
            } else if (uniqueIds.length < 2) {
                blockedReason = "Select at least two note or echo cards.";
            } else if (noteIds.length === 0) {
                blockedReason =
                    "Select at least one note. Echo-to-echo linking is not supported.";
            } else if (pairKeys.length === 0) {
                blockedReason =
                    "This selection does not form any supported note-based links.";
            }

            const existingPairCount = pairKeys.filter((key) =>
                manualLinkKeySet?.has(key),
            ).length;

            return {
                uniqueIds,
                noteIds,
                echoIds,
                invalidIds,
                pairKeys,
                blockedReason,
                existingPairCount,
            };
        },
        [getManualLinkPairKey, manualLinkKeySet],
    );

    const relationshipSelection = useMemo(
        () => getRelationshipSelectionInfo(selectedItemIds),
        [getRelationshipSelectionInfo, selectedItemIds],
    );

    const linkBlockedReason = relationshipSelection.blockedReason;
    const canLink =
        !linkBlockedReason && relationshipSelection.pairKeys.length > 0;
    const canUnlinkLinks =
        !linkBlockedReason && relationshipSelection.existingPairCount > 0;

    const handleManualLinkAction = async (action: "link" | "unlink") => {
        if (action === "link" && !canLink) {
            notify({
                title: "Link Blocked",
                message:
                    linkBlockedReason || "This selection cannot be linked.",
                tone: "warning",
            });
            return;
        }

        if (action === "unlink" && !canUnlinkLinks) {
            notify({
                title: "Unlink Blocked",
                message:
                    linkBlockedReason ||
                    "No existing manual links were found in the current selection.",
                tone: "warning",
            });
            return;
        }

        try {
            const response = await fetch(
                buildApiUrl(`/brain/links/${action}`),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        item_ids: relationshipSelection.uniqueIds,
                    }),
                },
            );
            const payload = await response.json().catch(() => null);

            if (response.ok && payload?.status === "success") {
                setSelectedItemIds([]);
                await refreshCanvasViews();
                publish(["mindmap.graph"]);
                notify({
                    title:
                        action === "link" ? "Links Created" : "Links Removed",
                    message:
                        action === "link"
                            ? `${payload?.created_count ?? 0} relationship${payload?.created_count === 1 ? "" : "s"} saved.`
                            : `${payload?.removed_count ?? 0} relationship${payload?.removed_count === 1 ? "" : "s"} removed.`,
                    tone: "success",
                });
                return;
            }

            notify({
                title: action === "link" ? "Link Failed" : "Unlink Failed",
                message:
                    payload?.message ||
                    `The app could not ${action === "link" ? "create" : "remove"} the selected relationships.`,
                tone: "error",
            });
        } catch (error) {
            console.error(`Failed to ${action} items`, error);
            notify({
                title: action === "link" ? "Link Failed" : "Unlink Failed",
                message: "The app could not reach the relationship endpoint.",
                tone: "error",
            });
        }
    };

    const handleAppendToArchive = async (
        targetArchiveId: string,
        itemIdsToMerge: string[],
    ) => {
        const blockReason = getArchiveBlockReason(itemIdsToMerge);
        if (blockReason) {
            notify({
                title: "Archive Blocked",
                message: blockReason,
                tone: "warning",
            });
            return;
        }

        try {
            const response = await fetch(buildApiUrl("/brain/archive/append"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target_archive_id: targetArchiveId,
                    item_ids: itemIdsToMerge,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (response.ok && payload?.status === "success") {
                setIsMergeMode(false);
                setSelectedItemIds([]);
                await refreshCanvasViews();
                notify({
                    title: "Merged Into Archive",
                    message:
                        payload?.moved_count > 0
                            ? `${payload.moved_count} item${payload.moved_count === 1 ? "" : "s"} moved successfully.`
                            : "Selection merged into the target archive.",
                    tone: "success",
                });
                return;
            }

            notify({
                title: "Merge Failed",
                message:
                    payload?.message ||
                    "The selected items could not be merged into that archive.",
                tone: "error",
            });
        } catch (error) {
            console.error("Failed to append to archive", error);
            notify({
                title: "Merge Failed",
                message: "The app could not reach the archive merge endpoint.",
                tone: "error",
            });
        }
    };

    const handleMarqueeSelectionComplete = useCallback(
        async (bounds: {
            left: number;
            right: number;
            top: number;
            bottom: number;
            screenLeft: number;
            screenRight: number;
            screenTop: number;
            screenBottom: number;
        }) => {
            if (currentExpandedId) {
                const safeRootExpandedId = rootExpandedId
                    ? String(rootExpandedId)
                    : "";
                if (!safeRootExpandedId) {
                    setSelectedItemIds([]);
                    return;
                }

                const expandedRootItem =
                    rootSceneItemById.get(safeRootExpandedId);
                if (!expandedRootItem) {
                    setSelectedItemIds([]);
                    return;
                }

                const modelSpaceParentX =
                    expandedRootItem.baseX + expandedRootItem.gridOffsetX;
                const modelSpaceParentY =
                    expandedRootItem.baseY + expandedRootItem.gridOffsetY;
                const modelSpaceOrbitLayout =
                    activeOrbitLayoutRef.current || {};

                const modelSpaceSelectedIds = Object.entries(
                    modelSpaceOrbitLayout,
                )
                    .map(([cardId, layout]: [string, any]) => {
                        if (!layout) return null;

                        const cardLeft = modelSpaceParentX + layout.x;
                        const cardRight = cardLeft + layout.w;
                        const cardTop = modelSpaceParentY + layout.y;
                        const cardBottom = cardTop + layout.h;

                        if (
                            cardRight >= bounds.left &&
                            cardLeft <= bounds.right &&
                            cardBottom >= bounds.top &&
                            cardTop <= bounds.bottom
                        ) {
                            return cardId;
                        }
                        return null;
                    })
                    .filter(Boolean);

                setSelectedItemIds(modelSpaceSelectedIds as string[]);
                return;
            }

            const selectedIds = rootSceneItems
                .map(({ itemId, worldX, worldY }) => {
                    if (
                        worldX + 200 >= bounds.left &&
                        worldX - 200 <= bounds.right &&
                        worldY + 250 >= bounds.top &&
                        worldY - 250 <= bounds.bottom
                    ) {
                        return itemId;
                    }
                    return null;
                })
                .filter(Boolean);

            setSelectedItemIds(selectedIds as string[]);
        },
        [currentExpandedId, rootExpandedId, rootSceneItemById, rootSceneItems],
    );

    const exitTouchShiftMode = useCallback(() => {
        clearTouchShiftTimer();
        touchShiftSessionRef.current = null;
        setTouchMarqueeBox(null);
        setIsTouchSelectionMode(false);
        setIsShiftDown(false);
        settleInteraction();
    }, [
        clearTouchShiftTimer,
        settleInteraction,
        setIsShiftDown,
        setIsTouchSelectionMode,
    ]);

    const handleClearSelectionToolbar = useCallback(() => {
        setSelectedItemIds([]);
        setIsMergeMode(false);
        if (isTouchSelectionMode) {
            exitTouchShiftMode();
            return;
        }
    }, [exitTouchShiftMode, isTouchSelectionMode]);
    const findTrackedTouch = useCallback(
        (
            touchList: {
                length: number;
                item(index: number): TouchPointLike | null;
            },
            touchId: number,
        ) => {
            for (let index = 0; index < touchList.length; index += 1) {
                const touch = touchList.item(index);
                if (touch && touch.identifier === touchId) {
                    return touch;
                }
            }
            return null;
        },
        [],
    );
    const syncTouchSelectionFromTouch = useCallback(
        (trackedTouch: TouchPointLike) => {
            const session = touchShiftSessionRef.current;
            if (!session || trackedTouch.identifier !== session.touchId) {
                return;
            }

            if (!session.activated) {
                const distance = Math.hypot(
                    trackedTouch.clientX - session.startClientX,
                    trackedTouch.clientY - session.startClientY,
                );
                if (distance > TOUCH_SHIFT_MOVE_TOLERANCE) {
                    clearTouchShiftTimer();
                    touchShiftSessionRef.current = null;
                    setIsTouchSelectionMode(false);
                }
                return;
            }

            const point = getCanvasPointFromClient(
                trackedTouch.clientX,
                trackedTouch.clientY,
            );
            if (!point) return;

            setTouchMarqueeBox((prev) =>
                prev
                    ? {
                          ...prev,
                          endX: point.x,
                          endY: point.y,
                          endClientX: trackedTouch.clientX,
                          endClientY: trackedTouch.clientY,
                      }
                    : prev,
            );
        },
        [clearTouchShiftTimer, getCanvasPointFromClient],
    );
    const finalizeTouchSelection = useCallback(
        async (
            trackedTouch: TouchPointLike | null,
            cancelSelection = false,
        ) => {
            const session = touchShiftSessionRef.current;
            if (
                !session ||
                !trackedTouch ||
                trackedTouch.identifier !== session.touchId
            ) {
                return;
            }

            const wasActivated = session.activated;
            const marqueeBox = touchMarqueeBoxRef.current;

            if (wasActivated && !cancelSelection && marqueeBox) {
                await handleMarqueeSelectionComplete({
                    left: Math.min(marqueeBox.startX, marqueeBox.endX),
                    right: Math.max(marqueeBox.startX, marqueeBox.endX),
                    top: Math.min(marqueeBox.startY, marqueeBox.endY),
                    bottom: Math.max(marqueeBox.startY, marqueeBox.endY),
                    screenLeft: Math.min(
                        marqueeBox.startClientX,
                        marqueeBox.endClientX,
                    ),
                    screenRight: Math.max(
                        marqueeBox.startClientX,
                        marqueeBox.endClientX,
                    ),
                    screenTop: Math.min(
                        marqueeBox.startClientY,
                        marqueeBox.endClientY,
                    ),
                    screenBottom: Math.max(
                        marqueeBox.startClientY,
                        marqueeBox.endClientY,
                    ),
                });
                suppressTouchClickUntilRef.current = Date.now() + 140;
            }

            exitTouchShiftMode();
        },
        [exitTouchShiftMode, handleMarqueeSelectionComplete],
    );
    const touchMarqueeViewportBox = useMemo(() => {
        if (!touchMarqueeBox) return null;

        const rect = canvasViewportRef.current?.getBoundingClientRect();
        if (!rect) return null;

        return {
            left:
                Math.min(
                    touchMarqueeBox.startClientX,
                    touchMarqueeBox.endClientX,
                ) - rect.left,
            top:
                Math.min(
                    touchMarqueeBox.startClientY,
                    touchMarqueeBox.endClientY,
                ) - rect.top,
            width: Math.max(
                1,
                Math.abs(
                    touchMarqueeBox.endClientX - touchMarqueeBox.startClientX,
                ),
            ),
            height: Math.max(
                1,
                Math.abs(
                    touchMarqueeBox.endClientY - touchMarqueeBox.startClientY,
                ),
            ),
        };
    }, [touchMarqueeBox]);

    useEffect(() => {
        const handleWindowTouchMove = (event: TouchEvent) => {
            const session = touchShiftSessionRef.current;
            if (!session) return;

            const trackedTouch = findTrackedTouch(
                event.touches,
                session.touchId,
            );
            if (!trackedTouch) return;

            event.preventDefault();
            syncTouchSelectionFromTouch(trackedTouch);
        };

        const handleWindowTouchEnd = (event: TouchEvent) => {
            const session = touchShiftSessionRef.current;
            if (!session) return;

            const trackedTouch = findTrackedTouch(
                event.changedTouches,
                session.touchId,
            );
            void finalizeTouchSelection(trackedTouch);
        };

        const handleWindowTouchCancel = (event: TouchEvent) => {
            const session = touchShiftSessionRef.current;
            if (!session) return;

            const trackedTouch = findTrackedTouch(
                event.changedTouches,
                session.touchId,
            );
            void finalizeTouchSelection(trackedTouch, true);
        };

        window.addEventListener("touchmove", handleWindowTouchMove, {
            passive: false,
        });
        window.addEventListener("touchend", handleWindowTouchEnd, {
            passive: false,
        });
        window.addEventListener("touchcancel", handleWindowTouchCancel, {
            passive: false,
        });

        return () => {
            window.removeEventListener("touchmove", handleWindowTouchMove);
            window.removeEventListener("touchend", handleWindowTouchEnd);
            window.removeEventListener("touchcancel", handleWindowTouchCancel);
        };
    }, [findTrackedTouch, finalizeTouchSelection, syncTouchSelectionFromTouch]);

    return (
        <div
            id="spatial-canvas-container"
            ref={canvasViewportRef}
            className="absolute inset-0 bg-[#f4f4f5] overflow-hidden pointer-events-auto"
            onTouchStartCapture={(e) => {
                if (
                    document.activeElement &&
                    document.activeElement.tagName === "TEXTAREA" &&
                    e.target !== document.activeElement
                ) {
                    (document.activeElement as HTMLElement).blur();
                }

                if (isShiftDown || e.touches.length !== 1) return;

                const target = e.target as HTMLElement | null;
                if (
                    target?.closest(
                        "button, input, textarea, select, option, a, label, [role='button'], [contenteditable='true']",
                    )
                ) {
                    return;
                }

                const touch = e.touches[0];
                if (!touch) return;

                const point = getCanvasPointFromClient(
                    touch.clientX,
                    touch.clientY,
                );
                if (!point) return;

                clearTouchShiftTimer();
                touchShiftSessionRef.current = {
                    touchId: touch.identifier,
                    startClientX: touch.clientX,
                    startClientY: touch.clientY,
                    startX: point.x,
                    startY: point.y,
                    activated: false,
                };

                touchShiftTimerRef.current = setTimeout(() => {
                    const session = touchShiftSessionRef.current;
                    if (!session || session.touchId !== touch.identifier)
                        return;

                    session.activated = true;
                    setIsTouchSelectionMode(true);
                    setIsShiftDown(true);
                    setTouchMarqueeBox({
                        startX: session.startX,
                        startY: session.startY,
                        endX: session.startX,
                        endY: session.startY,
                        startClientX: session.startClientX,
                        startClientY: session.startClientY,
                        endClientX: session.startClientX,
                        endClientY: session.startClientY,
                    });
                    suppressTouchClickUntilRef.current = Date.now() + 140;
                    startInteraction();
                }, TOUCH_SHIFT_HOLD_MS);
            }}
            onTouchMoveCapture={(e) => {
                const session = touchShiftSessionRef.current;
                if (!session) return;

                const trackedTouch = findTrackedTouch(
                    e.touches,
                    session.touchId,
                );
                if (!trackedTouch) return;

                syncTouchSelectionFromTouch(trackedTouch);
                if (session.activated) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
            onTouchEndCapture={(e) => {
                const session = touchShiftSessionRef.current;
                if (!session) return;

                const trackedTouch = findTrackedTouch(
                    e.changedTouches,
                    session.touchId,
                );
                if (!trackedTouch) return;

                if (session.activated) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                void finalizeTouchSelection(trackedTouch);
            }}
            onTouchCancelCapture={(e) => {
                const session = touchShiftSessionRef.current;
                if (!session) return;

                const trackedTouch = findTrackedTouch(
                    e.changedTouches,
                    session.touchId,
                );
                if (!trackedTouch) return;

                if (session.activated) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                void finalizeTouchSelection(trackedTouch, true);
            }}
            onClickCapture={(e) => {
                const target = e.target as HTMLElement | null;
                if (
                    target?.closest(
                        "button, input, textarea, select, option, a, label, [role='button'], [contenteditable='true']",
                    )
                ) {
                    return;
                }
                if (Date.now() < suppressTouchClickUntilRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
        >
            <div className="absolute top-30 left-1/2 -translate-x-1/2 z-[9999] flex items-center bg-white rounded-full p-1.5 shadow-lg border border-slate-200 sm:top-14">
                <button
                    onClick={() => {
                        setCanvasMode("ECHO");
                        setDrillDownPath([]);
                    }}
                    className={`px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                        canvasMode === "ECHO"
                            ? "bg-slate-900 text-white shadow-md"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    }`}
                >
                    Echo Mode
                </button>
                <button
                    onClick={() => {
                        setCanvasMode("NOTES");
                        setDrillDownPath([]);
                    }}
                    className={`px-6 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${
                        canvasMode === "NOTES"
                            ? "bg-slate-900 text-white shadow-md"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    }`}
                >
                    Notes Mode
                </button>
            </div>

            <TransformWrapper
                ref={transformComponentRef}
                initialScale={0.7}
                initialPositionX={300}
                initialPositionY={150}
                minScale={0.1}
                maxScale={3}
                limitToBounds={false}
                centerZoomedOut={false}
                panning={{
                    disabled: isShiftDown,
                    excluded: ["no-pan", "no-pan-resize"],
                }}
                onInit={(ref) => updateCulling(ref)}
                wheel={{
                    step: 0.1,
                    smoothStep: 0.0005,
                    excluded: ["no-pan", "no-pan-resize"],
                }}
                onWheelStart={() => startInteraction()}
                onWheelStop={(ref) => {
                    updateCulling(ref);
                    settleInteraction();
                }}
                onPanningStart={() => startInteraction()}
                onPanningStop={(ref) => {
                    updateCulling(ref);
                    settleInteraction();
                }}
                onZoomStart={() => startInteraction()}
                onZoomStop={(ref) => {
                    updateCulling(ref);
                    settleInteraction();
                }}
                // THE FIX: Stop the canvas from hijacking double clicks!
                doubleClick={{ disabled: true }}
            >
                <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                >
                    <div
                        className={`relative w-0 h-0 ${
                            isInteracting ? "canvas-interaction-reduced" : ""
                        }`}
                    >
                        <div
                            className="absolute pointer-events-none opacity-50"
                            style={{
                                left: -15000,
                                top: -15000,
                                width: 30000,
                                height: 30000,
                                backgroundImage:
                                    "radial-gradient(#cbd5e1 1.5px, transparent 1.5px)",
                                backgroundSize: "32px 32px",
                            }}
                        />
                        <MotionConfig
                            transformPagePoint={(p) => ({
                                x: p.x / canvasScale,
                                y: p.y / canvasScale,
                            })}
                        >
                            {renderedRootSceneItems.map(
                                ({
                                    item,
                                    index,
                                    itemId,
                                    savedMeta,
                                    baseX,
                                    baseY,
                                    gridOffsetX,
                                    gridOffsetY,
                                    isVisible,
                                }) => {
                                    const isSelected =
                                        selectedItemIdSet.has(itemId);

                                    if (item.is_archive_node) {
                                        // THE FIX 2: We removed the heavy array sorting from here!
                                        return (
                                            <SpatialArchiveFolder
                                                key={itemId}
                                                item={item}
                                                itemId={itemId}
                                                baseX={baseX}
                                                baseY={baseY}
                                                gridOffsetX={gridOffsetX}
                                                gridOffsetY={gridOffsetY}
                                                isSelected={isSelected}
                                                isVisible={isVisible} // <-- Pass the boolean!
                                                isBeingGridded={animatingGridIdSet.has(
                                                    itemId,
                                                )}
                                                gridAnimationTargets={
                                                    gridAnimationTargets
                                                }
                                                gridZIndexes={gridZIndexes}
                                                savedMeta={savedMeta}
                                                spatialMetadata={
                                                    spatialMetadata
                                                }
                                                bringToFrontGrid={
                                                    bringToFrontGrid
                                                }
                                                updateGridPosition={
                                                    updateGridPosition
                                                }
                                                canvasMode={canvasMode}
                                                fetchClusters={fetchClusters}
                                                fetchStacks={fetchStacks}
                                                setUnarchivingSource={
                                                    setUnarchivingSource
                                                }
                                                selectedItemIds={
                                                    selectedItemIds
                                                }
                                                selectedItemIdSet={
                                                    selectedItemIdSet
                                                }
                                                isMergeMode={isMergeMode}
                                                onAppendToArchive={
                                                    handleAppendToArchive
                                                }
                                                onSelect={(id: string) => {
                                                    setSelectedItemIds(
                                                        (prev) =>
                                                            prev.includes(id)
                                                                ? prev.filter(
                                                                      (p) =>
                                                                          p !==
                                                                          id,
                                                                  )
                                                                : [...prev, id],
                                                    );
                                                }}
                                                onDrillDown={handleDrillDown}
                                                interactionReduced={
                                                    isInteracting
                                                }
                                            />
                                        );
                                    }

                                    return (
                                        <div
                                            key={itemId}
                                            className="absolute pointer-events-none"
                                            style={{
                                                border: isSelected
                                                    ? "2px solid #4ade80"
                                                    : "2px solid transparent",
                                                borderRadius: "26px",
                                                transition: "border 0.2s ease",
                                                zIndex:
                                                    gridZIndexes[itemId] ||
                                                    savedMeta?.z_index ||
                                                    (isSelected ? 9999 : 1),
                                            }}
                                        >
                                            <div className="pointer-events-auto w-full h-full">
                                                <SpatialStack
                                                    itemId={itemId}
                                                    isMergeMode={isMergeMode}
                                                    onAppendToArchive={
                                                        handleAppendToArchive
                                                    }
                                                    isVisible={isVisible} // <-- Pass the boolean!
                                                    cluster={
                                                        canvasMode === "ECHO"
                                                            ? item
                                                            : null
                                                    }
                                                    noteStack={
                                                        canvasMode === "NOTES"
                                                            ? item
                                                            : null
                                                    }
                                                    allGroups={groups}
                                                    clusterIndex={index}
                                                    initialX={baseX}
                                                    initialY={baseY}
                                                    gridOffsetX={gridOffsetX}
                                                    gridOffsetY={gridOffsetY}
                                                    isExpanded={
                                                        rootExpandedId ===
                                                        itemId
                                                    }
                                                    drillDownPath={
                                                        rootExpandedId ===
                                                        itemId
                                                            ? drillDownPath
                                                            : []
                                                    } // <--- NEW PROP
                                                    onDrillDown={
                                                        handleDrillDown
                                                    } // <--- NEW PROP
                                                    onDrillUp={handleDrillUp}
                                                    canvasScale={canvasScale}
                                                    canvasMode={canvasMode}
                                                    fetchNotesForGroup={
                                                        fetchNotesForGroup
                                                    }
                                                    currentNotes={currentNotes}
                                                    globalNotes={globalNotes}
                                                    allClusters={clusters}
                                                    isBeingArchived={animatingArchiveIdSet.has(
                                                        itemId,
                                                    )}
                                                    animatingArchive={
                                                        animatingArchive
                                                    }
                                                    onToggleStack={
                                                        handleToggleStack
                                                    }
                                                    isBeingUnarchived={unarchivingSourceIdSet.has(
                                                        itemId,
                                                    )}
                                                    unarchivingSource={
                                                        unarchivingSource
                                                    }
                                                    bringToFrontGrid={
                                                        bringToFrontGrid
                                                    }
                                                    updateGridPosition={
                                                        updateGridPosition
                                                    }
                                                    isBeingGridded={animatingGridIdSet.has(
                                                        itemId,
                                                    )}
                                                    gridAnimationTargets={
                                                        gridAnimationTargets
                                                    }
                                                    selectedItemIds={
                                                        selectedItemIds
                                                    }
                                                    onOrbitLayoutUpdate={
                                                        updateActiveOrbitLayout
                                                    }
                                                    spatialMetadata={
                                                        spatialMetadata
                                                    }
                                                    onFocusNote={onFocusNote}
                                                    archiveGroupsById={
                                                        archiveGroupsById
                                                    }
                                                    archiveGroupsByDisplayParentId={
                                                        archiveGroupsByDisplayParentId
                                                    }
                                                    archiveStateByItemId={
                                                        archiveStateByItemId
                                                    }
                                                    groupContentsById={
                                                        groupContentsById
                                                    }
                                                    echoesById={echoesById} // <--- NEW
                                                    notesByLinkedEchoId={
                                                        notesByLinkedEchoId
                                                    } // <--- NEW
                                                    linkedEchoIdsByNoteId={
                                                        linkedEchoIdsByNoteId
                                                    }
                                                    linkSummaryByItemId={
                                                        linkSummaryByItemId
                                                    }
                                                    onOpenMindMap={
                                                        onOpenMindMap
                                                    }
                                                    noteStacks={stacks}
                                                    noteGroups={groups}
                                                    onSaveWorkspaceNote={
                                                        handleSaveWorkspaceNote
                                                    }
                                                    fetchClusters={fetchClusters}
                                                    groupsByOwnerId={
                                                        groupsByOwnerId
                                                    }
                                                    interactionReduced={
                                                        isInteracting
                                                    }
                                                />
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </MotionConfig>
                        <div
                            className={`absolute inset-0 z-[99999] ${
                                isShiftDown && !isTouchSelectionMode
                                    ? "pointer-events-auto"
                                    : "pointer-events-none"
                            }`}
                        >
                            <MarqueeSelector
                                isShiftDown={
                                    isShiftDown && !isTouchSelectionMode
                                }
                                canvasScale={canvasScale}
                                cameraPositionX={cameraPositionX}
                                cameraPositionY={cameraPositionY}
                                viewportRef={canvasViewportRef}
                                onCancel={exitTouchShiftMode}
                                onSelectionComplete={
                                    handleMarqueeSelectionComplete
                                }
                            />
                        </div>
                    </div>
                </TransformComponent>
            </TransformWrapper>

            {touchMarqueeViewportBox && (
                <div className="absolute inset-0 z-[10000] pointer-events-none">
                    <div
                        className="absolute rounded-sm border-[3px] border-blue-500 bg-blue-500/10"
                        style={{
                            boxSizing: "border-box",
                            left: touchMarqueeViewportBox.left,
                            top: touchMarqueeViewportBox.top,
                            width: touchMarqueeViewportBox.width,
                            height: touchMarqueeViewportBox.height,
                        }}
                    />
                </div>
            )}

            <SelectionToolbar
                selectedCount={selectedItemIds.length}
                setIsMergeMode={setIsMergeMode}
                hasFoldersSelected={hasFoldersSelected}
                isShiftDown={isShiftDown}
                expandedStackId={currentExpandedId}
                rootContextId={rootExpandedId || currentExpandedId}
                showUnarchive={showUnarchive}
                isMergeMode={isMergeMode}
                archiveBlockedReason={archiveBlockedReason}
                showLinkActions={relationshipSelection.uniqueIds.length >= 2}
                canLink={canLink}
                canUnlinkLinks={canUnlinkLinks}
                linkBlockedReason={linkBlockedReason}
                onLink={() => handleManualLinkAction("link")}
                onUnlinkLinks={() => handleManualLinkAction("unlink")}
                activeLayout={
                    expandedIndex !== -1
                        ? loopDataset[expandedIndex]?.orbit_layout
                        : []
                }
                canvasMode={canvasMode}
                onSuccess={() => {
                    refreshCanvasViews();
                }}
                onClear={handleClearSelectionToolbar}
                onSetGrid={async () => {
                    if (currentExpandedId) {
                        const currentLayout = activeOrbitLayoutRef.current;

                        await saveGridSet(
                            currentExpandedId,
                            currentLayout,
                            Object.keys(currentLayout), // Securely grabs all live card IDs
                            () => {
                                setSelectedItemIds([]);
                                console.log("Orbit slots saved securely!");
                                refreshCanvasViews();
                            },
                        );
                    } else {
                        // --- ORIGINAL: ROOT CLUSTER SAVING MODE (100% UNTOUCHED) ---
                        saveGrid({
                            selectedIds: selectedItemIds,
                            spatialMetadata: spatialMetadata,
                            dataset: loopDataset,
                            getId: (item: any) =>
                                canvasMode === "ECHO" ? item.id : item.stack_id,
                            getType: (item: any) =>
                                item?.is_archive_node ? "ARCHIVE" : "GRID",
                            getDefaultPos: (index: number) => {
                                const row = Math.floor(index / 3);
                                const col = index % 3;
                                return {
                                    x: col * 600 + (row % 2 === 0 ? 0 : 300),
                                    y: row * 650,
                                };
                            },
                            onSuccess: () => {
                                setSelectedItemIds([]);
                                setTimeout(() => {
                                    refreshCanvasViews({ refreshNotes: false });
                                }, 600);
                            },
                        });
                    }
                }}
                onArchive={async () => {
                    if (selectedItemIds.length === 0) return;

                    if (archiveBlockedReason) {
                        notify({
                            title: "Archive Blocked",
                            message: archiveBlockedReason,
                            tone: "warning",
                        });
                        return;
                    }

                    const rootItems = selectedItemIds.filter(
                        (id) =>
                            id.startsWith("cluster_") ||
                            id.startsWith("stack_"),
                    );
                    const scatteredItems = selectedItemIds.filter(
                        (id) =>
                            !id.startsWith("cluster_") &&
                            !id.startsWith("stack_"),
                    );

                    let targetX = 300;
                    let targetY = 150;

                    const firstId = selectedItemIds[0];
                    const currentOrbitLayout = activeOrbitLayoutRef.current;
                    const activeLayout = firstId
                        ? currentOrbitLayout[firstId]
                        : null;
                    if (activeLayout) {
                        targetX = activeLayout.x;
                        targetY = activeLayout.y;
                    } else {
                        const lastId =
                            selectedItemIds[selectedItemIds.length - 1];
                        const lastIndex = loopDataset.findIndex(
                            (item: any) =>
                                (canvasMode === "ECHO"
                                    ? item.id
                                    : item.stack_id) === lastId,
                        );
                        if (lastIndex !== -1) {
                            const row = Math.floor(lastIndex / 3);
                            const col = lastIndex % 3;
                            targetX =
                                (lastId
                                    ? draftGridCoordinates[lastId]?.x
                                    : undefined) ??
                                (lastId
                                    ? spatialMetadata[lastId]?.x_coord
                                    : undefined) ??
                                col * 600 + (row % 2 === 0 ? 0 : 300);
                            targetY =
                                (lastId
                                    ? draftGridCoordinates[lastId]?.y
                                    : undefined) ??
                                (lastId
                                    ? spatialMetadata[lastId]?.y_coord
                                    : undefined) ??
                                row * 650;
                        }
                    }

                    setAnimatingArchive({
                        isActive: true,
                        targetX,
                        targetY,
                        sourceIds: selectedItemIds,
                    });

                    try {
                        let newSubArchiveId = null;

                        if (scatteredItems.length > 0) {
                            const response = await fetch(
                                buildApiUrl("/brain/archive/scattered"),
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        items: scatteredItems,
                                        // ✨ THE FIX: Explicitly tell the DB exactly where this folder belongs in the hierarchy
                                        owner_item_id: rootExpandedId,
                                        owner_item_type:
                                            canvasMode === "ECHO"
                                                ? "cluster"
                                                : "stack",
                                        display_parent_id:
                                            (currentExpandedId &&
                                            groupsById[currentExpandedId]
                                                ?.group_kind === "archive"
                                                ? groupsById[currentExpandedId]
                                                      .display_parent_id ||
                                                  groupsById[currentExpandedId]
                                                      .restore_group_id ||
                                                  groupsById[currentExpandedId]
                                                      .owner_item_id
                                                : currentExpandedId) ||
                                            rootExpandedId,
                                        restore_group_id:
                                            currentExpandedId !== rootExpandedId
                                                ? currentExpandedId
                                                : null,
                                        title: `Archive ${new Date().toLocaleDateString()}`,
                                        // Legacy fallbacks
                                        parent_stack_id: rootExpandedId,
                                        canvas_mode: canvasMode,
                                    }),
                                },
                            );
                            const payload = await response.json();
                            if (
                                payload.status === "success" &&
                                payload.folder_id
                            )
                                newSubArchiveId = payload.folder_id;
                        }

                        if (rootItems.length > 0) {
                            const response = await fetch(
                                buildApiUrl("/brain/archive/group"),
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        items: rootItems,
                                        type: canvasMode,
                                    }),
                                },
                            );
                            const payload = await response.json();
                            if (
                                payload.status === "success" &&
                                payload.archive_id
                            ) {
                                try {
                                    await fetch(
                                        buildApiUrl(
                                            "/brain/canvas/metadata/save",
                                        ),
                                        {
                                            method: "POST",
                                            headers: {
                                                "Content-Type":
                                                    "application/json",
                                            },
                                            body: JSON.stringify({
                                                items: [
                                                    {
                                                        item_id:
                                                            payload.archive_id,
                                                        item_type: canvasMode,
                                                        x_coord: targetX,
                                                        y_coord: targetY,
                                                        z_index: 9999,
                                                        orientation: "portrait",
                                                    },
                                                ],
                                            }),
                                        },
                                    );
                                } catch (e) {}
                            }
                        }

                        // THE FIX: Clean Frontend Exit. The database handled the deletion,
                        // we just need to see if we should auto-close the folder view.
                        if (currentExpandedId) {
                            let totalItems = 0;
                            totalItems += (globalNotes || []).filter(
                                (n: any) =>
                                    String(n.group_id) ===
                                    String(currentExpandedId),
                            ).length;
                            (clusters || []).forEach((c: any) => {
                                totalItems += (c.chunks || []).filter(
                                    (chunk: any) =>
                                        String(chunk.group_id) ===
                                        String(currentExpandedId),
                                ).length;
                            });

                            const isFolderEmpty =
                                totalItems - selectedItemIds.length <= 0;

                            if (isFolderEmpty) {
                                handleDrillUp();
                            } else if (newSubArchiveId) {
                                const newLayout = {
                                    ...(activeOrbitLayoutRef.current || {}),
                                };
                                selectedItemIds.forEach(
                                    (id) => delete newLayout[id],
                                );
                                newLayout[newSubArchiveId] = {
                                    x: targetX,
                                    y: targetY,
                                    index: Object.keys(newLayout).length,
                                    w: 220,
                                    h: 160,
                                };
                                await saveGridSet(
                                    currentExpandedId,
                                    newLayout,
                                    Object.keys(newLayout),
                                );
                                activeOrbitLayoutRef.current = newLayout;
                            }
                        }

                        setSelectedItemIds([]);
                        await refreshCanvasViews();
                        scheduleArchiveAnimationReset();
                    } catch (error) {
                        console.error("Failed to archive items", error);
                        setAnimatingArchive(null);
                    }
                }}
                onUnarchive={async () => {
                    if (selectedArchiveEligibleIds.length === 0) return;

                    // 1. Check if user selected the FULL ARCHIVE FOLDER itself to dissolve it entirely
                    const fullArchivesToProcess: {
                        id: string;
                        type: string;
                    }[] = [];
                    const individualItems = [...selectedArchiveEligibleIds]; // <-- THE FIX: Only process eligible IDs

                    for (let i = individualItems.length - 1; i >= 0; i--) {
                        const id = individualItems[i];
                        if (!id) continue;

                        // Check Global Vault Outer Archives
                        const vaultNode = loopDataset.find(
                            (n: any) => n.stack_id === "GLOBAL_ARCHIVE_VAULT",
                        );
                        if (vaultNode) {
                            const child = vaultNode.chunks.find(
                                (c: any) =>
                                    c.stack_id === id ||
                                    c.id === id ||
                                    c.group_id === id,
                            );
                            if (child && child.is_outer) {
                                fullArchivesToProcess.push({
                                    id: String(id),
                                    type:
                                        child.type === "cluster"
                                            ? "ECHO"
                                            : "NOTES",
                                });
                                individualItems.splice(i, 1);
                                continue;
                            }
                        }

                        // Check standard nodes
                        const node = loopDataset.find(
                            (item: any) =>
                                (canvasMode === "ECHO"
                                    ? item.id
                                    : item.stack_id) === id,
                        );

                        if (
                            node?.is_archive_node &&
                            id !== "GLOBAL_ARCHIVE_VAULT"
                        ) {
                            // It's an Outer Archive
                            fullArchivesToProcess.push({
                                id: String(id),
                                type: canvasMode,
                            });
                            individualItems.splice(i, 1);
                        } else if (node?.is_inner) {
                            // ✨ THE FIX: Explicitly target Inner Archives!
                            fullArchivesToProcess.push({
                                id: String(id),
                                type: "INNER_ARCHIVE",
                            });
                            individualItems.splice(i, 1);
                        }
                    }

                    // Dissolve full folders
                    if (fullArchivesToProcess.length > 0) {
                        try {
                            await Promise.all(
                                fullArchivesToProcess.map((target) =>
                                    fetch(
                                        buildApiUrl("/brain/archive/ungroup"),
                                        {
                                            method: "POST",
                                            headers: {
                                                "Content-Type":
                                                    "application/json",
                                            },
                                            body: JSON.stringify({
                                                archive_id: target.id,
                                                type: target.type,
                                            }),
                                        },
                                    ),
                                ),
                            );
                        } catch (error) {
                            console.error(
                                "Failed full folder unarchive",
                                error,
                            );
                        }
                    }

                    if (individualItems.length === 0) {
                        setSelectedItemIds((prev) =>
                            prev.filter(
                                (id) =>
                                    !selectedArchiveEligibleIds.includes(id),
                            ),
                        );
                        await refreshCanvasViews();
                        return;
                    }

                    // 2. THE FIX: Explicitly separate Data Types so the backend doesn't ignore the request!
                    const rootItems = individualItems.filter(
                        (id) =>
                            id.startsWith("cluster_") ||
                            id.startsWith("stack_"),
                    );
                    const scatteredItems = individualItems.filter(
                        (id) =>
                            !id.startsWith("cluster_") &&
                            !id.startsWith("stack_"),
                    );

                    const parentArchiveIds = new Set<string>();
                    individualItems.forEach((id) => {
                        const parentArchiveId = groupByItemId[id];
                        if (
                            parentArchiveId &&
                            archiveGroupsById[parentArchiveId]
                        ) {
                            parentArchiveIds.add(parentArchiveId);
                        }
                    });
                    if (
                        currentExpandedId &&
                        archiveGroupsById[currentExpandedId] &&
                        scatteredItems.length > 0
                    ) {
                        parentArchiveIds.add(currentExpandedId);
                    }

                    // Unarchive Root Items (Primary Slots / Clusters)
                    if (rootItems.length > 0) {
                        try {
                            await fetch(
                                buildApiUrl("/brain/archive/ungroup/items"),
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        items: rootItems,
                                        type: canvasMode,
                                    }),
                                },
                            );
                        } catch (e) {
                            console.error("Failed root items unarchive", e);
                        }
                    }

                    // Unarchive Scattered Items (Inner Cards / Echoes)
                    if (scatteredItems.length > 0) {
                        try {
                            await fetch(
                                buildApiUrl("/brain/archive/scattered/remove"),
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        items: scatteredItems,
                                        canvas_mode: canvasMode,
                                    }),
                                },
                            );
                        } catch (e) {
                            console.error(
                                "Failed scattered items unarchive",
                                e,
                            );
                        }
                    }

                    // 3. CLEANUP: Destroy any parent archive that is now an empty ghost shell!
                    for (const pId of parentArchiveIds) {
                        const pNode =
                            loopDataset.find(
                                (item: any) =>
                                    (canvasMode === "ECHO"
                                        ? item.id
                                        : item.stack_id) === pId,
                            ) ||
                            (archiveGroupsById[pId]
                                ? {
                                      id: pId,
                                      stack_id: pId,
                                      chunks: groupContentsById[pId] || [],
                                  }
                                : null);
                        if (pNode) {
                            const remaining = pNode.chunks.filter(
                                (c: any) =>
                                    !individualItems.includes(
                                        c.id ||
                                            c.chunk_id ||
                                            c.group_id ||
                                            c.stack_id,
                                    ),
                            );
                            if (remaining.length === 0) {
                                // The folder is completely empty! Kill it!
                                if (currentExpandedId === pId) handleDrillUp();
                                await fetch(
                                    buildApiUrl("/brain/archive/ungroup"),
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            archive_id: pId,
                                            type: "INNER_ARCHIVE",
                                        }),
                                    },
                                );
                            } else if (currentExpandedId === pId) {
                                // Folder survives, just update the visual layout to remove the extracted item
                                const newLayout = {
                                    ...(activeOrbitLayoutRef.current || {}),
                                };
                                individualItems.forEach(
                                    (id) => delete newLayout[id],
                                );
                                await saveGridSet(
                                    pId,
                                    newLayout,
                                    Object.keys(newLayout),
                                );
                                activeOrbitLayoutRef.current = newLayout;
                            }
                        }
                    }

                    // ONLY clear the items that were successfully unarchived from the selection
                    setSelectedItemIds((prev) =>
                        prev.filter(
                            (id) => !selectedArchiveEligibleIds.includes(id),
                        ),
                    );
                    await refreshCanvasViews();
                }}
            />
        </div>
    );
}
