import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import useNotes from "../../../../hooks/noteManager/useNotes";
import { confirmAction, notify } from "../../../system/AppNotifications";
import { useCanvasSnapshot } from "../../../system/CanvasSnapshotProvider";
import { useModelRuntime } from "../../../system/ModelRuntimeProvider";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

const ROOT_COLUMN_X_OFFSET = 620;
const CHILD_COLUMN_X_OFFSET = 560;
const CHILD_COLUMN_Y_OFFSET = 120;

export default function useEchoDashboardState({
    isOpen,
    results = [],
    recommendations = [],
    query = "",
    loading = false,
    activeBookTitle = "Current Focus",
    activeBookAuthor = "Active Selection",
    notes = [],
    libraryId = "",
}: any) {
    const { ensureRolesThen } = useModelRuntime();
    const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
    const [topZIndex, setTopZIndex] = useState(10);
    const [zIndexes, setZIndexes] = useState<Record<string, number>>({});
    const [canvasScale, setCanvasScale] = useState(1);
    const [maximizedClusterId, setMaximizedClusterId] = useState<string | null>(
        null,
    );
    const [viewMode, setViewMode] = useState<"ECHOES" | "RECS">("ECHOES");
    const [expandedEchoByCluster, setExpandedEchoByCluster] = useState<
        Record<string, string | null>
    >({});
    const [draftBranches, setDraftBranches] = useState<any[]>([]);

    const { stacks, groups, fetchStacks, fetchGroups, createNote, updateNote } =
        useNotes("echoDashboard");
    const {
        clusters: savedGlobalClusters = [],
        notes: globalNotes = [],
        manualLinks = [],
        ensureCanvasSnapshot,
        refreshCanvasSnapshot,
    } = useCanvasSnapshot();

    const [pendingEchoForNote, setPendingEchoForNote] = useState<{
        markdown: string;
        title: string;
        echoId: string;
    } | null>(null);

    const [echoNoteState, setEchoNoteState] = useState<{
        isOpen: boolean;
        groupId: string | null;
        prefill: string;
        prefillTitle: string;
        echoId: string | null;
        initialNote?: any;
    }>({
        isOpen: false,
        groupId: null,
        prefill: "",
        prefillTitle: "",
        echoId: null,
    });

    const activeColumnId = "active_focus";
    const [positions, setPositions] = useState<
        Record<string, { x: number; y: number }>
    >({
        [activeColumnId]: { x: 550, y: 100 },
    });

    const [viewingEchoNotes, setViewingEchoNotes] = useState<{
        echoId: string;
    } | null>(null);

    const unsavedEchoes = results || [];
    const isGlobalCanvas = activeBookTitle === "Global Cognitive Canvas";
    const showInbox =
        unsavedEchoes.length > 0 ||
        recommendations?.length > 0 ||
        loading ||
        !isGlobalCanvas;

    const [zoomTarget, setZoomTarget] = useState<string | null>(null);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const [isCanvasWheelDisabled, setIsCanvasWheelDisabled] = useState(false);

    const localLinkedNotes = useMemo(() => {
        const linkMap: Record<string, string[]> = {};
        const pushLinkedNote = (echoId: string, noteId: string) => {
            if (!echoId || !noteId) return;
            if (!linkMap[echoId]) linkMap[echoId] = [];
            if (!linkMap[echoId].includes(noteId)) {
                linkMap[echoId].push(noteId);
            }
        };

        globalNotes.forEach((note: any) => {
            if (note.linked_echo_id && note.linked_echo_id !== "null") {
                pushLinkedNote(
                    String(note.linked_echo_id),
                    String(note.note_id),
                );
            }
        });

        manualLinks.forEach((link: any) => {
            const sourceId = String(link.source_id || "");
            const targetId = String(link.target_id || "");
            const noteId = sourceId.startsWith("note_")
                ? sourceId
                : targetId.startsWith("note_")
                  ? targetId
                  : "";
            const echoId = sourceId.startsWith("echo_")
                ? sourceId
                : targetId.startsWith("echo_")
                  ? targetId
                  : "";
            if (noteId && echoId) {
                pushLinkedNote(echoId, noteId);
            }
        });

        return linkMap;
    }, [globalNotes, manualLinks]);

    const expandedEchoIds = useMemo(
        () =>
            Object.values(expandedEchoByCluster)
                .filter(Boolean)
                .map((echoId) => String(echoId)),
        [expandedEchoByCluster],
    );

    const expandedEchoIdSet = useMemo(
        () => new Set(expandedEchoIds),
        [expandedEchoIds],
    );

    const draftPersistedClusterIds = useMemo(
        () =>
            new Set(
                draftBranches
                    .map((draft: any) => String(draft.persistedClusterId || ""))
                    .filter(Boolean),
            ),
        [draftBranches],
    );

    const visibleSavedClusters = useMemo(
        () =>
            (savedGlobalClusters || []).filter((cluster: any) => {
                const clusterId = String(cluster.id || cluster.cluster_id || "");
                if (!clusterId) return false;
                if (draftPersistedClusterIds.has(clusterId)) return false;
                if (!cluster.parent_cluster_id) return true;
                if (!cluster.source_echo_id) return true;
                return expandedEchoIdSet.has(String(cluster.source_echo_id));
            }),
        [draftPersistedClusterIds, expandedEchoIdSet, savedGlobalClusters],
    );

    const visibleDraftBranches = useMemo(
        () =>
            draftBranches.filter((draft: any) =>
                expandedEchoIdSet.has(String(draft.sourceEchoId || "")),
            ),
        [draftBranches, expandedEchoIdSet],
    );

    const branchesBySourceEchoId = useMemo(() => {
        const next: Record<string, any[]> = {};
        const pushBranch = (sourceEchoId: string, branch: any) => {
            if (!sourceEchoId) return;
            if (!next[sourceEchoId]) next[sourceEchoId] = [];
            next[sourceEchoId].push(branch);
        };

        (savedGlobalClusters || []).forEach((cluster: any) => {
            const sourceEchoId = String(cluster.source_echo_id || "");
            if (!sourceEchoId) return;
            pushBranch(sourceEchoId, cluster);
        });

        draftBranches.forEach((draft: any) => {
            const sourceEchoId = String(draft.sourceEchoId || "");
            if (!sourceEchoId) return;
            pushBranch(sourceEchoId, draft);
        });

        return next;
    }, [draftBranches, savedGlobalClusters]);

    const highlightedBranchClusterIds = useMemo(
        () =>
            new Set(
                [
                    ...visibleSavedClusters
                        .filter(
                            (cluster: any) =>
                                cluster.source_echo_id &&
                                expandedEchoIdSet.has(
                                    String(cluster.source_echo_id),
                                ),
                        )
                        .map((cluster: any) =>
                            String(cluster.id || cluster.cluster_id || ""),
                        ),
                    ...visibleDraftBranches.map((draft: any) =>
                        String(draft.id || ""),
                    ),
                ].filter(Boolean),
            ),
        [expandedEchoIdSet, visibleDraftBranches, visibleSavedClusters],
    );

    const refreshGlobalCanvas = useCallback(
        async () => refreshCanvasSnapshot(),
        [refreshCanvasSnapshot],
    );
    useEffect(() => {
        const pendingStr = sessionStorage.getItem("pendingEchoAction");
        if (pendingStr && isOpen) {
            try {
                const action = JSON.parse(pendingStr);
                sessionStorage.removeItem("pendingEchoAction");
                setTimeout(() => {
                    setZoomTarget(action.clusterId);
                    setHighlightId(action.clusterId);
                    setTimeout(() => setHighlightId(null), 1200);
                }, 400);
            } catch (e) {}
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            ensureCanvasSnapshot();
        }
    }, [ensureCanvasSnapshot, isOpen]);

    useEffect(() => {
        if (isOpen || pendingEchoForNote) {
            fetchStacks();
            fetchGroups();
        }
    }, [isOpen, pendingEchoForNote, fetchStacks, fetchGroups]);

    // THE FIXED N-LEVEL GRID ALGORITHM (Breadth-First Traversal)
    useEffect(() => {
        setPositions((prev) => {
            const newPos = { ...prev };
            let hasChanges = false;

            if (!newPos[activeColumnId]) {
                newPos[activeColumnId] = { x: 100, y: 100 };
                hasChanges = true;
            }

            let maxX =
                (newPos[activeColumnId]?.x ?? 100) + ROOT_COLUMN_X_OFFSET;

            // 2. Pre-scan existing roots to find the edge of our horizontal grid
            savedGlobalClusters.forEach((c) => {
                const clusterId = String(c.id || "");
                if (!clusterId) return;
                const existingPos = newPos[clusterId];
                if (
                    !c.parent_cluster_id &&
                    existingPos &&
                    existingPos.x !== 1000
                ) {
                    maxX = Math.max(maxX, existingPos.x + ROOT_COLUMN_X_OFFSET);
                }
            });

            // 3. Position New Roots strictly on the grid
            const rootClusters = savedGlobalClusters.filter(
                (c) => !c.parent_cluster_id,
            );
            rootClusters.forEach((c) => {
                const clusterId = String(c.id || "");
                if (!clusterId) return;
                const existingPos = newPos[clusterId];
                if (!existingPos || existingPos.x === 1000) {
                    newPos[clusterId] = { x: maxX, y: 100 };
                    maxX += ROOT_COLUMN_X_OFFSET;
                    hasChanges = true;
                }
            });

            // 4. Map the entire family tree
            const branchedClusters = savedGlobalClusters.filter(
                (c) => c.parent_cluster_id,
            );
            const branchesByParent: Record<string, any[]> = {};

            branchedClusters.forEach((c) => {
                const parentId = String(c.parent_cluster_id || "");
                if (!parentId) return;
                if (!branchesByParent[parentId])
                    branchesByParent[parentId] = [];
                branchesByParent[parentId].push(c);
            });

            // 5. Position N-Level Branches (BFS ensures parents are placed BEFORE their children)
            const queue = rootClusters
                .map((c) => String(c.id || ""))
                .filter(Boolean);
            const placedThisRound = new Set<string>(queue);

            while (queue.length > 0) {
                const currentParentId = queue.shift()!;
                const children = branchesByParent[currentParentId] || [];

                // Sort children to prevent stacking race conditions
                children.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

                children.forEach((child, index) => {
                    const childId = String(child.id || "");
                    if (!childId) return;
                    const childPos = newPos[childId];
                    if (!childPos || childPos.x === 1000) {
                        const parentPos = newPos[currentParentId];
                        if (!parentPos) return;
                        newPos[childId] = {
                            x: parentPos.x + CHILD_COLUMN_X_OFFSET,
                            y: parentPos.y + index * CHILD_COLUMN_Y_OFFSET,
                        };
                        hasChanges = true;
                    }

                    queue.push(childId);
                    placedThisRound.add(childId);
                });
            }

            // 6. Catch Orphans (If a parent was deleted but the child remains, snap it to the main grid)
            branchedClusters.forEach((c) => {
                const clusterId = String(c.id || "");
                if (!clusterId) return;
                if (
                    !placedThisRound.has(clusterId) &&
                    (!newPos[clusterId] || newPos[clusterId].x === 1000)
                ) {
                    newPos[clusterId] = { x: maxX, y: 50 };
                    maxX += ROOT_COLUMN_X_OFFSET;
                    hasChanges = true;
                }
            });

            return hasChanges ? newPos : prev;
        });
    }, [savedGlobalClusters]);

    const handleRenameCluster = useCallback(
        async (clusterId: string, newTitle: string) => {
            try {
                await axios.put(
                    buildApiUrl("/brain/cluster/update_title"),
                    {
                        cluster_id: clusterId,
                        title: newTitle,
                    },
                );
                await refreshCanvasSnapshot();
            } catch (err) {
                console.error("Rename failed", err);
            }
        },
        [refreshCanvasSnapshot],
    );

    const handleDeleteCluster = useCallback(
        async (clusterId: string) => {
            const confirmed = await confirmAction({
                title: "Delete Column",
                message:
                    "Are you sure you want to delete this column? All child branches and saved echoes will be permanently deleted.",
                tone: "error",
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
            });
            if (!confirmed) return;

            try {
                await axios.delete(
                    buildApiUrl(`/brain/cluster/${clusterId}`),
                );
                await refreshCanvasSnapshot();
            } catch (err) {
                console.error("Delete failed", err);
            }
        },
        [refreshCanvasSnapshot],
    );

    const handleToggleActive = async (
        clusterId: string,
        bookId: string,
        libId: string,
    ) => {
        try {
            await axios.post(
                buildApiUrl("/brain/cluster/activate"),
                {
                    cluster_id: clusterId,
                    book_id: bookId,
                    library_id: libId || "",
                },
            );
            await refreshCanvasSnapshot();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSpawnCluster = async (
        parentId: string,
        bookId: string,
        libId: string,
        parentTitle: string,
    ) => {
        try {
            const res = await axios.post(
                buildApiUrl("/brain/cluster/spawn"),
                {
                    book_id: bookId,
                    library_id: libId || "",
                    parent_cluster_id: parentId,
                    title: `${parentTitle || "Branch"} Branch`,
                    make_active: false,
                },
            );
            if (res.data?.status !== "success" || !res.data?.cluster_id) {
                notify({
                    title: "Branch Creation Failed",
                    message: res.data?.message || "The new branch could not be created.",
                    tone: "error",
                });
                return;
            }
            const newCluster = {
                id: res.data.cluster_id,
            };
            const parentPos = positions[parentId];
            if (parentPos) {
                const siblingCount =
                    savedGlobalClusters.filter(
                        (cluster: any) =>
                            String(cluster.parent_cluster_id || "") ===
                            String(parentId),
                    ).length +
                    draftBranches.filter(
                        (draft: any) =>
                            String(draft.parentClusterId || "") === String(parentId),
                    ).length;
                setPositions((prev) => ({
                    ...prev,
                    [newCluster.id]: {
                        x: parentPos.x + CHILD_COLUMN_X_OFFSET,
                        y: parentPos.y + siblingCount * CHILD_COLUMN_Y_OFFSET,
                    },
                }));
            }
            await refreshCanvasSnapshot();
            setZoomTarget(String(newCluster.id));
            setHighlightId(String(newCluster.id));
            window.setTimeout(() => setHighlightId(null), 1200);
        } catch (e) {
            console.error(e);
            notify({
                title: "Branch Creation Failed",
                message: "The new branch could not be created right now.",
                tone: "error",
            });
        }
    };

    const toggleSavedEchoExpansion = useCallback(
        (clusterId: string, echoId: string) => {
            setExpandedEchoByCluster((prev) => ({
                ...prev,
                [clusterId]: prev[clusterId] === echoId ? null : echoId,
            }));
        },
        [],
    );

    const closeDraftBranch = useCallback((draftId: string) => {
        setDraftBranches((prev) =>
            prev.filter((draft: any) => String(draft.id) !== String(draftId)),
        );
    }, []);

    const focusBranchesForEcho = useCallback(
        (echoId: string) => {
            const relatedBranches = branchesBySourceEchoId[echoId] || [];
            const firstBranch = relatedBranches[0];
            const branchId = String(
                firstBranch?.persistedClusterId ||
                    firstBranch?.id ||
                    firstBranch?.cluster_id ||
                    "",
            );
            if (branchId) {
                setZoomTarget(branchId);
                setHighlightId(branchId);
                window.setTimeout(() => setHighlightId(null), 1200);
            }
        },
        [branchesBySourceEchoId],
    );

    const ensureDraftBranchCluster = useCallback(
        async (draftId: string) => {
            const existingDraft = draftBranches.find(
                (draft: any) => String(draft.id) === String(draftId),
            );
            if (!existingDraft) return null;
            if (existingDraft.persistedClusterId) {
                return String(existingDraft.persistedClusterId);
            }

            const res = await axios.post(buildApiUrl("/brain/cluster/spawn"), {
                book_id: existingDraft.bookId,
                library_id: existingDraft.libraryId || "",
                parent_cluster_id: existingDraft.parentClusterId,
                source_echo_id: existingDraft.sourceEchoId,
                title: existingDraft.title,
                make_active: false,
            });

            if (res.data?.status !== "success" || !res.data?.cluster_id) {
                return null;
            }

            const clusterId = String(res.data.cluster_id);
            setDraftBranches((prev) =>
                prev.map((draft: any) =>
                    String(draft.id) === String(draftId)
                        ? { ...draft, persistedClusterId: clusterId }
                        : draft,
                ),
            );
            setPositions((prev) => ({
                ...prev,
                [clusterId]: prev[draftId] || {
                    x: prev[activeColumnId]?.x || 1000,
                    y: prev[activeColumnId]?.y || 100,
                },
            }));
            return clusterId;
        },
        [activeColumnId, draftBranches],
    );

    const handleDraftBranchSaved = useCallback(
        async (draftId: string, clusterId: string) => {
            closeDraftBranch(draftId);
            setZoomTarget(clusterId);
            await refreshCanvasSnapshot();
        },
        [closeDraftBranch, refreshCanvasSnapshot],
    );

    const createDraftBranchFromHighlight = useCallback(
        async ({
            text,
            sourceEchoId,
            parentClusterId,
            parentClusterTitle,
            bookId,
            libraryId,
        }: {
            text: string;
            sourceEchoId: string;
            parentClusterId: string;
            parentClusterTitle: string;
            bookId: string;
            libraryId: string;
        }) => {
            const highlightText = text.trim();
            if (!highlightText) return;

            const draftId = `draft_branch_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 7)}`;
            const parentPos = positions[parentClusterId] || {
                x: 1000,
                y: 100,
            };
            const siblingCount = draftBranches.filter(
                (draft: any) =>
                    String(draft.parentClusterId) === String(parentClusterId) &&
                    String(draft.sourceEchoId) === String(sourceEchoId),
            ).length;
            const nextPos = {
                x: parentPos.x + CHILD_COLUMN_X_OFFSET,
                y: parentPos.y + siblingCount * CHILD_COLUMN_Y_OFFSET,
            };

            setPositions((prev) => ({
                ...prev,
                [draftId]: nextPos,
            }));
            setDraftBranches((prev) => [
                ...prev,
                {
                    id: draftId,
                    title:
                        highlightText.length > 48
                            ? `${highlightText.slice(0, 48)}...`
                            : highlightText,
                    query: highlightText,
                    sourceEchoId,
                    parentClusterId,
                    parentClusterTitle,
                    bookId,
                    libraryId,
                    resultGroups: [],
                    recommendations: [],
                    isLoading: true,
                    errorMessage: "",
                },
            ]);
            setZoomTarget(draftId);

            try {
                const res = await ensureRolesThen(["embedding", "reasoning"], () =>
                    axios.post(buildApiUrl("/echo/context"), {
                        text: highlightText,
                        limit: 15,
                        book_title: parentClusterTitle || undefined,
                    }),
                );
                if (!res) {
                    setDraftBranches((prev) =>
                        prev.map((draft: any) =>
                            String(draft.id) === String(draftId)
                                ? {
                                      ...draft,
                                      isLoading: false,
                                      errorMessage:
                                          "The branch search did not return a response.",
                                  }
                                : draft,
                        ),
                    );
                    return;
                }

                const payload = res.data?.data || res.data || {};
                const resultGroups = Array.isArray(payload.timeline)
                    ? payload.timeline
                    : [];
                const branchRecommendations = Array.isArray(
                    payload.recommendations,
                )
                    ? payload.recommendations
                    : [];

                setDraftBranches((prev) =>
                    prev.map((draft: any) =>
                        String(draft.id) === String(draftId)
                            ? {
                                  ...draft,
                                  resultGroups,
                                  recommendations: branchRecommendations,
                                  isLoading: false,
                                  errorMessage: "",
                              }
                            : draft,
                    ),
                );

                if (
                    resultGroups.length === 0 &&
                    branchRecommendations.length === 0
                ) {
                    notify({
                        title: "No Branch Echoes",
                        message:
                            "No related echoes were found for the selected highlight.",
                        tone: "warning",
                    });
                }
            } catch (error) {
                console.error("Draft branch creation failed", error);
                setDraftBranches((prev) =>
                    prev.map((draft: any) =>
                        String(draft.id) === String(draftId)
                            ? {
                                  ...draft,
                                  isLoading: false,
                                  errorMessage:
                                      "The highlight search could not be completed right now.",
                              }
                            : draft,
                    ),
                );
                notify({
                    title: "Branch Search Failed",
                    message:
                        "The highlight search could not be completed right now.",
                    tone: "error",
                });
            }
        },
        [draftBranches, ensureRolesThen, positions],
    );

    // THE FIX: Stable callbacks so memoized child components don't re-render
    const toggleStack = useCallback((stackId: string) => {
        setExpandedStackId((prev) => (prev === stackId ? null : stackId));
    }, []);

    const bringToFront = useCallback((id: string) => {
        setTopZIndex((prev) => {
            const nextZ = prev + 1;
            setZIndexes((zMap) => ({ ...zMap, [id]: nextZ }));
            return nextZ;
        });
    }, []);

    // THE FIX: Recursive tree dragging via Shift Key
    const updatePosition = useCallback(
        (
            id: string,
            newPos: { x: number; y: number },
            isShift: boolean = false,
        ) => {
            setPositions((prev) => {
                const oldPos = prev[id] || { x: 0, y: 0 };
                const dx = newPos.x - oldPos.x;
                const dy = newPos.y - oldPos.y;

                const next = { ...prev, [id]: newPos };

                // If Shift was held, move the entire branch tree along with the parent
                if (isShift) {
                    const descendants: string[] = [];
                    const queue = [id];

                    while (queue.length > 0) {
                        const currentId = queue.shift()!;
                        const children = [
                            ...savedGlobalClusters
                                .filter(
                                    (c: any) =>
                                        c.parent_cluster_id === currentId,
                                )
                                .map((c: any) => c.id),
                            ...draftBranches
                                .filter(
                                    (draft: any) =>
                                        draft.parentClusterId === currentId,
                                )
                                .map((draft: any) => draft.id),
                        ];

                        descendants.push(...children);
                        queue.push(...children);
                    }

                    descendants.forEach((descId) => {
                        if (prev[descId]) {
                            next[descId] = {
                                x: prev[descId].x + dx,
                                y: prev[descId].y + dy,
                            };
                        }
                    });
                }
                return next;
            });
        },
        [draftBranches, savedGlobalClusters], // Dependency required to map the family tree
    );

    return {
        expandedStackId,
        zIndexes,
        canvasScale,
        setCanvasScale,
        maximizedClusterId,
        setMaximizedClusterId,
        viewMode,
        setViewMode,
        stacks,
        groups,
        createNote,
        updateNote,
        pendingEchoForNote,
        setPendingEchoForNote,
        echoNoteState,
        setEchoNoteState,
        activeColumnId,
        positions,
        globalNotes,
        savedGlobalClusters,
        visibleSavedClusters,
        draftBranches,
        visibleDraftBranches,
        expandedEchoByCluster,
        branchesBySourceEchoId,
        highlightedBranchClusterIds,
        viewingEchoNotes,
        setViewingEchoNotes,
        localLinkedNotes,
        unsavedEchoes,
        showInbox,
        zoomTarget,
        setZoomTarget,
        highlightId,
        refreshGlobalCanvas,
        handleToggleActive,
        handleSpawnCluster,
        toggleSavedEchoExpansion,
        createDraftBranchFromHighlight,
        ensureDraftBranchCluster,
        handleDraftBranchSaved,
        closeDraftBranch,
        focusBranchesForEcho,
        toggleStack,
        bringToFront,
        updatePosition,
        isCanvasWheelDisabled,
        setIsCanvasWheelDisabled,
        handleRenameCluster,
        handleDeleteCluster,
    };
}
