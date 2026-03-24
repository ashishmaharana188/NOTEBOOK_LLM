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

  const [isShiftDown, setIsShiftDown] = useShiftKey();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const selectedItemIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds],
  );

  const [isMergeMode, setIsMergeMode] = useState(false);

  const activeOrbitLayoutRef = useRef<Record<string, any>>({});
  const archiveAnimationResetRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
          (g: any) => String(g.group_id) === String(currentExpandedId),
        ) ||
        (stacks || []).some(
          (s: any) => String(s.stack_id) === String(currentExpandedId),
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

  const updateActiveOrbitLayout = useCallback((nextLayout: Record<string, any>) => {
    activeOrbitLayoutRef.current = nextLayout || {};
  }, []);

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
      const itemId = String(item.id || item.stack_id || item.group_id || "");
      if (itemId) ids.add(itemId);
    });
    loopDataset.forEach((item: any) => {
      const itemId = String(item.id || item.stack_id || item.group_id || "");
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
      const next = prev.filter((id) => knownCanvasItemIds.has(String(id)));
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
      Object.entries(currentLayout).filter(([id]) => knownCanvasItemIds.has(id)),
    );
    if (Object.keys(currentLayout).length !== Object.keys(prunedLayout).length) {
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
      const childId = String(child.group_id || child.id || child.stack_id || "");
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
    [archiveContextByItemId, archiveGroupsById, groupsById, archiveFolderIds],
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
    setCanvasScale,
    cullingRect,
    updateCulling,
  } = useCanvasCamera(canvasMode, loopDataset, spatialMetadata);

  const expandedIndex = loopDataset.findIndex(
    (item: any) =>
      (canvasMode === "ECHO" ? item.id : item.stack_id) === rootExpandedId,
  );
  const expandedRow = expandedIndex !== -1 ? Math.floor(expandedIndex / 3) : -1;
  const expandedCol = expandedIndex !== -1 ? expandedIndex % 3 : -1;

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
  const hasFoldersSelected = selectedItemIds.some((id) =>
    groups.some((g: any) => g.group_id === id) || archiveFolderIds.has(String(id)),
  );

  const getManualLinkPairKey = useCallback((leftId: string, rightId: string) => {
    return [String(leftId), String(rightId)].sort().join("::");
  }, []);

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
        for (let otherIndex = index + 1; otherIndex < noteIds.length; otherIndex += 1) {
          const sourceNoteId = noteIds[index];
          const targetNoteId = noteIds[otherIndex];
          if (!sourceNoteId || !targetNoteId) continue;
          pairKeys.push(getManualLinkPairKey(sourceNoteId, targetNoteId));
        }
      }

      noteIds.forEach((noteId) => {
        echoIds.forEach((echoId) => {
          pairKeys.push(getManualLinkPairKey(noteId, echoId));
        });
      });

      let blockedReason = null;
      if (invalidIds.length > 0) {
        blockedReason = "Only note and echo cards can participate in manual links.";
      } else if (uniqueIds.length < 2) {
        blockedReason = "Select at least two note or echo cards.";
      } else if (noteIds.length === 0) {
        blockedReason = "Select at least one note. Echo-to-echo linking is not supported.";
      } else if (pairKeys.length === 0) {
        blockedReason = "This selection does not form any supported note-based links.";
      }

      const existingPairCount = pairKeys.filter((key) => manualLinkKeySet?.has(key)).length;

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
  const canLink = !linkBlockedReason && relationshipSelection.pairKeys.length > 0;
  const canUnlinkLinks =
    !linkBlockedReason && relationshipSelection.existingPairCount > 0;

  const handleManualLinkAction = async (action: "link" | "unlink") => {
    if (action === "link" && !canLink) {
      notify({
        title: "Link Blocked",
        message: linkBlockedReason || "This selection cannot be linked.",
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
        `http://127.0.0.1:8000/brain/links/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_ids: relationshipSelection.uniqueIds }),
        },
      );
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.status === "success") {
        setSelectedItemIds([]);
        await refreshCanvasViews();
        publish(["mindmap.graph"]);
        notify({
          title: action === "link" ? "Links Created" : "Links Removed",
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
      const response = await fetch("http://127.0.0.1:8000/brain/archive/append", {
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

  return (
    <div
      id="spatial-canvas-container"
      ref={canvasViewportRef}
      className="absolute inset-0 bg-[#f4f4f5] overflow-hidden pointer-events-auto"
      onPointerDownCapture={(e) => {
        if (
          document.activeElement &&
          document.activeElement.tagName === "TEXTAREA" &&
          e.target !== document.activeElement
        ) {
          (document.activeElement as HTMLElement).blur();
        }
      }}
    >
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center bg-white rounded-full p-1.5 shadow-lg border border-slate-200">
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
        onInit={(ref) => {
          setCanvasScale(ref.state.scale);
          updateCulling(ref);
        }}
        wheel={{
          step: 0.1,
          smoothStep: 0.0005,
          excluded: ["no-pan", "no-pan-resize"],
        }}
        onPanningStop={(ref) => updateCulling(ref)}
        onZoomStop={(ref) => {
          setCanvasScale(ref.state.scale);
          updateCulling(ref);
        }}
        // THE FIX: Stop the canvas from hijacking double clicks!
        doubleClick={{ disabled: true }}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
          <div className="relative w-0 h-0">
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
              {loopDataset.map((item: any, i: number) => {
                const row = Math.floor(i / 3);
                const col = i % 3;
                const itemId = canvasMode === "ECHO" ? item.id : item.stack_id;

                const savedMeta = spatialMetadata[itemId];
                const draftMeta = draftGridCoordinates[itemId];

                const defaultX = col * 600 + (row % 2 === 0 ? 0 : 300);
                const defaultY = row * 650;

                const baseX = draftMeta?.x ?? savedMeta?.x_coord ?? defaultX;
                const baseY = draftMeta?.y ?? savedMeta?.y_coord ?? defaultY;

                let gridOffsetX = 0;
                let gridOffsetY = 0;

                if (expandedIndex !== -1 && i !== expandedIndex) {
                  const colDiff = col - expandedCol;
                  const rowDiff = row - expandedRow;

                  if (colDiff < 0) gridOffsetX = -1200;
                  else if (colDiff > 0) gridOffsetX = 1200;

                  if (rowDiff < 0) gridOffsetY = -900;
                  else if (rowDiff > 0) gridOffsetY = 1600;
                }

                // THE FIX 1: Calculate boolean visibility here to prevent the Culling Cascade!
                const isVisible =
                  baseX + gridOffsetX > cullingRect.left &&
                  baseX + gridOffsetX < cullingRect.right &&
                  baseY + gridOffsetY > cullingRect.top &&
                  baseY + gridOffsetY < cullingRect.bottom;

                const isSelected = selectedItemIdSet.has(itemId);

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
                      isBeingGridded={animatingGridIds.includes(itemId)}
                      gridAnimationTargets={gridAnimationTargets}
                      gridZIndexes={gridZIndexes}
                      savedMeta={savedMeta}
                      spatialMetadata={spatialMetadata}
                      bringToFrontGrid={bringToFrontGrid}
                      updateGridPosition={updateGridPosition}
                      canvasMode={canvasMode}
                      fetchClusters={fetchClusters}
                      fetchStacks={fetchStacks}
                      setUnarchivingSource={setUnarchivingSource}
                      selectedItemIds={selectedItemIds}
                      selectedItemIdSet={selectedItemIdSet}
                      isMergeMode={isMergeMode}
                      onAppendToArchive={handleAppendToArchive}
                      onSelect={(id: string) => {
                        setSelectedItemIds((prev) =>
                          prev.includes(id)
                            ? prev.filter((p) => p !== id)
                            : [...prev, id],
                        );
                      }}
                      onDrillDown={handleDrillDown}
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
                        onAppendToArchive={handleAppendToArchive}
                        isVisible={isVisible} // <-- Pass the boolean!
                        cluster={canvasMode === "ECHO" ? item : null}
                        noteStack={canvasMode === "NOTES" ? item : null}
                        allGroups={groups}
                        clusterIndex={i}
                        initialX={baseX}
                        initialY={baseY}
                        gridOffsetX={gridOffsetX}
                        gridOffsetY={gridOffsetY}
                        isExpanded={rootExpandedId === itemId}
                        drillDownPath={
                          rootExpandedId === itemId ? drillDownPath : []
                        } // <--- NEW PROP
                        onDrillDown={handleDrillDown} // <--- NEW PROP
                        onDrillUp={handleDrillUp}
                        canvasScale={canvasScale}
                        canvasMode={canvasMode}
                        fetchNotesForGroup={fetchNotesForGroup}
                        currentNotes={currentNotes}
                        globalNotes={globalNotes}
                        allClusters={clusters}
                        isBeingArchived={animatingArchive?.sourceIds.includes(
                          itemId,
                        )}
                        animatingArchive={animatingArchive}
                        onToggleStack={handleToggleStack}
                        isBeingUnarchived={unarchivingSource?.sourceIds.includes(
                          itemId,
                        )}
                        unarchivingSource={unarchivingSource}
                        bringToFrontGrid={bringToFrontGrid}
                        updateGridPosition={updateGridPosition}
                        isBeingGridded={animatingGridIds.includes(itemId)}
                        gridAnimationTargets={gridAnimationTargets}
                        selectedItemIds={selectedItemIds}
                        onOrbitLayoutUpdate={updateActiveOrbitLayout}
                        spatialMetadata={spatialMetadata}
                        onFocusNote={onFocusNote}
                        archiveGroupsById={archiveGroupsById}
                        archiveGroupsByDisplayParentId={
                          archiveGroupsByDisplayParentId
                        }
                        archiveStateByItemId={archiveStateByItemId}
                        groupContentsById={groupContentsById}
                        echoesById={echoesById} // <--- NEW
                        notesByLinkedEchoId={notesByLinkedEchoId} // <--- NEW
                        linkedEchoIdsByNoteId={linkedEchoIdsByNoteId}
                        linkSummaryByItemId={linkSummaryByItemId}
                        onOpenMindMap={onOpenMindMap}
                        groupsByOwnerId={groupsByOwnerId}
                      />
                    </div>
                  </div>
                );
              })}
            </MotionConfig>
            ///
            <div
              className={`absolute inset-0 z-[99999] ${isShiftDown ? "pointer-events-auto" : "pointer-events-none"}`}
            >
              <MarqueeSelector
                isShiftDown={isShiftDown}
                canvasScale={canvasScale}
                cameraPositionX={cameraPositionX}
                cameraPositionY={cameraPositionY}
                viewportRef={canvasViewportRef}
                onCancel={() => setIsShiftDown(false)}
                onSelectionComplete={async (bounds) => {
                  if (currentExpandedId) {
                    const domSelectedIds = Array.from(
                      document.querySelectorAll<HTMLElement>(
                        '[data-selectable="true"][data-selection-id]',
                      ),
                    )
                      .map((node) => {
                        const rect = node.getBoundingClientRect();
                        const overlaps =
                          rect.right >= bounds.screenLeft &&
                          rect.left <= bounds.screenRight &&
                          rect.bottom >= bounds.screenTop &&
                          rect.top <= bounds.screenBottom;

                        if (!overlaps) return null;
                        return node.dataset.selectionId || null;
                      })
                      .filter(Boolean);

                    setSelectedItemIds(domSelectedIds as string[]);
                    return;

                    const safeRootExpandedId = rootExpandedId
                      ? String(rootExpandedId)
                      : "";
                    if (!safeRootExpandedId) return;

                    const expandedItemIndex = loopDataset.findIndex(
                      (item: any) =>
                        (canvasMode === "ECHO" ? item.id : item.stack_id) ===
                        safeRootExpandedId,
                    );
                    if (expandedItemIndex === -1) return;

                    const row = Math.floor(expandedItemIndex / 3);
                    const col = expandedItemIndex % 3;
                    const defX = col * 600 + (row % 2 === 0 ? 0 : 300);
                    const defY = row * 650;

                    const draft = draftGridCoordinates[safeRootExpandedId];
                    const saved = spatialMetadata[safeRootExpandedId];

                    const parentX = draft?.x ?? saved?.x_coord ?? defX;
                    const parentY = draft?.y ?? saved?.y_coord ?? defY;

                    // ✨ THE FIX: Read from the REF instead of the stale state!
                    const currentOrbitLayout = activeOrbitLayoutRef.current;

                    const selectedIds = Object.entries(currentOrbitLayout)
                      .map(([cardId, layout]: [string, any]) => {
                        const cardLeft = parentX + layout.x;
                        const cardRight = cardLeft + layout.w;
                        const cardTop = parentY + layout.y;
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

                    setSelectedItemIds(selectedIds as string[]);
                  } else {
                    // --- ORIGINAL ROOT CLUSTER SELECTION MODE ---
                    const selectedIds = loopDataset
                      .map((item: any, i: number) => {
                        const itemId =
                          canvasMode === "ECHO" ? item.id : item.stack_id;
                        const draft = draftGridCoordinates[itemId];
                        const saved = spatialMetadata[itemId];

                        const row = Math.floor(i / 3);
                        const col = i % 3;
                        const defX = col * 600 + (row % 2 === 0 ? 0 : 300);
                        const defY = row * 650;

                        const actualX = draft?.x ?? saved?.x_coord ?? defX;
                        const actualY = draft?.y ?? saved?.y_coord ?? defY;

                        if (
                          actualX + 200 >= bounds.left &&
                          actualX - 200 <= bounds.right &&
                          actualY + 250 >= bounds.top &&
                          actualY - 250 <= bounds.bottom
                        ) {
                          return itemId;
                        }
                        return null;
                      })
                      .filter(Boolean);

                    setSelectedItemIds(selectedIds as string[]);
                  }
                }}
              />
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>

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
          expandedIndex !== -1 ? loopDataset[expandedIndex]?.orbit_layout : []
        }
        canvasMode={canvasMode}
        onSuccess={() => {
          refreshCanvasViews();
        }}
        onClear={() => setSelectedItemIds([])}
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
            (id) => id.startsWith("cluster_") || id.startsWith("stack_"),
          );
          const scatteredItems = selectedItemIds.filter(
            (id) => !id.startsWith("cluster_") && !id.startsWith("stack_"),
          );

          let targetX = 300;
          let targetY = 150;

          const firstId = selectedItemIds[0];
          const currentOrbitLayout = activeOrbitLayoutRef.current;
          const activeLayout = firstId ? currentOrbitLayout[firstId] : null;
          if (activeLayout) {
            targetX = activeLayout.x;
            targetY = activeLayout.y;
          } else {
            const lastId = selectedItemIds[selectedItemIds.length - 1];
            const lastIndex = loopDataset.findIndex(
              (item: any) =>
                (canvasMode === "ECHO" ? item.id : item.stack_id) === lastId,
            );
            if (lastIndex !== -1) {
              const row = Math.floor(lastIndex / 3);
              const col = lastIndex % 3;
              targetX =
                (lastId ? draftGridCoordinates[lastId]?.x : undefined) ??
                (lastId ? spatialMetadata[lastId]?.x_coord : undefined) ??
                col * 600 + (row % 2 === 0 ? 0 : 300);
              targetY =
                (lastId ? draftGridCoordinates[lastId]?.y : undefined) ??
                (lastId ? spatialMetadata[lastId]?.y_coord : undefined) ??
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
                "http://127.0.0.1:8000/brain/archive/scattered",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    items: scatteredItems,
                    // ✨ THE FIX: Explicitly tell the DB exactly where this folder belongs in the hierarchy
                    owner_item_id: rootExpandedId,
                    owner_item_type:
                      canvasMode === "ECHO" ? "cluster" : "stack",
                    display_parent_id:
                      (currentExpandedId &&
                      groupsById[currentExpandedId]?.group_kind === "archive"
                        ? groupsById[currentExpandedId].display_parent_id ||
                          groupsById[currentExpandedId].restore_group_id ||
                          groupsById[currentExpandedId].owner_item_id
                        : currentExpandedId) || rootExpandedId,
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
              if (payload.status === "success" && payload.folder_id)
                newSubArchiveId = payload.folder_id;
            }

            if (rootItems.length > 0) {
              const response = await fetch(
                "http://127.0.0.1:8000/brain/archive/group",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ items: rootItems, type: canvasMode }),
                },
              );
              const payload = await response.json();
              if (payload.status === "success" && payload.archive_id) {
                try {
                  await fetch(
                    "http://127.0.0.1:8000/brain/canvas/metadata/save",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        items: [
                          {
                            item_id: payload.archive_id,
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
                (n: any) => String(n.group_id) === String(currentExpandedId),
              ).length;
              (clusters || []).forEach((c: any) => {
                totalItems += (c.chunks || []).filter(
                  (chunk: any) =>
                    String(chunk.group_id) === String(currentExpandedId),
                ).length;
              });

              const isFolderEmpty = totalItems - selectedItemIds.length <= 0;

              if (isFolderEmpty) {
                handleDrillUp();
              } else if (newSubArchiveId) {
                const newLayout = { ...(activeOrbitLayoutRef.current || {}) };
                selectedItemIds.forEach((id) => delete newLayout[id]);
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
          const fullArchivesToProcess: { id: string; type: string }[] = [];
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
                  c.stack_id === id || c.id === id || c.group_id === id,
              );
              if (child && child.is_outer) {
                fullArchivesToProcess.push({
                  id: String(id),
                  type: child.type === "cluster" ? "ECHO" : "NOTES",
                });
                individualItems.splice(i, 1);
                continue;
              }
            }

            // Check standard nodes
            const node = loopDataset.find(
              (item: any) =>
                (canvasMode === "ECHO" ? item.id : item.stack_id) === id,
            );

            if (node?.is_archive_node && id !== "GLOBAL_ARCHIVE_VAULT") {
              // It's an Outer Archive
              fullArchivesToProcess.push({ id: String(id), type: canvasMode });
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
                  fetch("http://127.0.0.1:8000/brain/archive/ungroup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      archive_id: target.id,
                      type: target.type,
                    }),
                  }),
                ),
              );
            } catch (error) {
              console.error("Failed full folder unarchive", error);
            }
          }

          if (individualItems.length === 0) {
            setSelectedItemIds((prev) =>
              prev.filter((id) => !selectedArchiveEligibleIds.includes(id)),
            );
            await refreshCanvasViews();
            return;
          }

          // 2. THE FIX: Explicitly separate Data Types so the backend doesn't ignore the request!
          const rootItems = individualItems.filter(
            (id) => id.startsWith("cluster_") || id.startsWith("stack_"),
          );
          const scatteredItems = individualItems.filter(
            (id) => !id.startsWith("cluster_") && !id.startsWith("stack_"),
          );

          const parentArchiveIds = new Set<string>();
          individualItems.forEach((id) => {
            const parentArchiveId = groupByItemId[id];
            if (parentArchiveId && archiveGroupsById[parentArchiveId]) {
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
              await fetch("http://127.0.0.1:8000/brain/archive/ungroup/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: rootItems, type: canvasMode }),
              });
            } catch (e) {
              console.error("Failed root items unarchive", e);
            }
          }

          // Unarchive Scattered Items (Inner Cards / Echoes)
          if (scatteredItems.length > 0) {
            try {
              await fetch(
                "http://127.0.0.1:8000/brain/archive/scattered/remove",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    items: scatteredItems,
                    canvas_mode: canvasMode,
                  }),
                },
              );
            } catch (e) {
              console.error("Failed scattered items unarchive", e);
            }
          }

          // 3. CLEANUP: Destroy any parent archive that is now an empty ghost shell!
          for (const pId of parentArchiveIds) {
            const pNode =
              loopDataset.find(
                (item: any) =>
                  (canvasMode === "ECHO" ? item.id : item.stack_id) === pId,
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
                    c.id || c.chunk_id || c.group_id || c.stack_id,
                  ),
              );
              if (remaining.length === 0) {
                // The folder is completely empty! Kill it!
                if (currentExpandedId === pId) handleDrillUp();
                await fetch("http://127.0.0.1:8000/brain/archive/ungroup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    archive_id: pId,
                    type: "INNER_ARCHIVE",
                  }),
                });
              } else if (currentExpandedId === pId) {
                // Folder survives, just update the visual layout to remove the extracted item
                const newLayout = { ...(activeOrbitLayoutRef.current || {}) };
                individualItems.forEach((id) => delete newLayout[id]);
                await saveGridSet(pId, newLayout, Object.keys(newLayout));
                activeOrbitLayoutRef.current = newLayout;
              }
            }
          }

          // ONLY clear the items that were successfully unarchived from the selection
          setSelectedItemIds((prev) =>
            prev.filter((id) => !selectedArchiveEligibleIds.includes(id)),
          );
          await refreshCanvasViews();
        }}
      />
    </div>
  );
}
