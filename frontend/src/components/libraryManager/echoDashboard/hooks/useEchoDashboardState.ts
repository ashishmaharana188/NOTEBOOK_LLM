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
const DERIVED_COLUMN_X_OFFSET = 640;
const DERIVED_COLUMN_Y_OFFSET = 90;

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
    const { ensureRolesThen, runtime } = useModelRuntime();
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
    const [derivedColumns, setDerivedColumns] = useState<any[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedCanvasItems, setSelectedCanvasItems] = useState<
        Record<string, any>
    >({});
    const [ragComposerState, setRagComposerState] = useState<{
        open: boolean;
        prompt: string;
        contexts: any[];
        selectionRefs: any[];
        sourceAnchorIds: string[];
        titleHint: string;
        includeWeb: boolean;
        scopeLabel: string;
    }>({
        open: false,
        prompt: "",
        contexts: [],
        selectionRefs: [],
        sourceAnchorIds: [],
        titleHint: "",
        includeWeb: true,
        scopeLabel: "",
    });

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
    const selectedItems = useMemo(
        () => Object.values(selectedCanvasItems || {}),
        [selectedCanvasItems],
    );

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

    const visibleDerivedColumns = useMemo(
        () =>
            derivedColumns.filter((column: any) => {
                const sourceEchoIds = Array.isArray(column.sourceEchoIds)
                    ? column.sourceEchoIds
                          .map((echoId: any) => String(echoId || ""))
                          .filter(Boolean)
                    : [];
                if (sourceEchoIds.length === 0) {
                    return true;
                }
                return sourceEchoIds.some((echoId: string) =>
                    expandedEchoIdSet.has(echoId),
                );
            }),
        [derivedColumns, expandedEchoIdSet],
    );

    const analysisRequiredRoles = useMemo(() => {
        const reasoningProfile = String(
            runtime?.config?.reasoning_profile || "",
        );
        const reasoningProvider = String(
            runtime?.catalog?.reasoning?.[reasoningProfile]?.provider || "",
        );
        return reasoningProvider === "ollama"
            ? (["embedding", "reasoning"] as const)
            : (["embedding"] as const);
    }, [runtime]);

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

    const handleEchoSaved = useCallback(
        ({
            echoId,
            clusterId,
        }: {
            echoId: string;
            clusterId: string;
            created: boolean;
        }) => {
            if (!echoId || !clusterId) {
                return;
            }

            setExpandedEchoByCluster((prev) => ({
                ...prev,
                [clusterId]: echoId,
            }));
        },
        [],
    );

    const clearSelections = useCallback(() => {
        setSelectedCanvasItems({});
    }, []);

    const toggleSelectionMode = useCallback(() => {
        setSelectionMode((prev) => {
            const next = !prev;
            if (!next) {
                setSelectedCanvasItems({});
            }
            return next;
        });
    }, []);

    const toggleCanvasSelection = useCallback((item: any) => {
        const selectionKey = String(item?.key || "");
        if (!selectionKey) return;
        setSelectedCanvasItems((prev) => {
            if (prev[selectionKey]) {
                const next = { ...prev };
                delete next[selectionKey];
                return next;
            }
            return {
                ...prev,
                [selectionKey]: {
                    ...item,
                    anchorId: String(item.anchorId || ""),
                    contexts: Array.isArray(item.contexts) ? item.contexts : [],
                    selectionRefs: Array.isArray(item.selectionRefs)
                        ? item.selectionRefs
                        : [],
                },
            };
        });
    }, []);

    const isCanvasItemSelected = useCallback(
        (key: string) => Boolean(selectedCanvasItems[String(key)]),
        [selectedCanvasItems],
    );

    const selectionPayload = useMemo(() => {
        const contextsMap = new Map<string, any>();
        const refsMap = new Map<string, any>();
        const anchorIds = new Set<string>();
        const labels: string[] = [];

        selectedItems.forEach((item: any) => {
            if (item.anchorId) {
                anchorIds.add(String(item.anchorId));
            }
            if (item.label) {
                labels.push(String(item.label));
            }
            (item.contexts || []).forEach((context: any, index: number) => {
                const contextId = String(
                    context.context_id ||
                        `${item.key || "selection"}:context:${index}`,
                );
                if (!contextsMap.has(contextId)) {
                    contextsMap.set(contextId, {
                        ...context,
                        context_id: contextId,
                    });
                }
            });
            (item.selectionRefs || []).forEach((ref: any, index: number) => {
                const refKey = `${ref.kind || "selection"}:${ref.id || `${item.key}:${index}`}`;
                if (!refsMap.has(refKey)) {
                    refsMap.set(refKey, ref);
                }
            });
        });

        return {
            contexts: Array.from(contextsMap.values()),
            selectionRefs: Array.from(refsMap.values()),
            sourceAnchorIds: Array.from(anchorIds).filter(Boolean),
            titleHint:
                labels.length === 1
                    ? (labels[0] ?? "")
                    : labels.length > 1
                      ? `${labels.length} Selected Sources`
                      : "",
            scopeLabel:
                labels.length === 1
                    ? (labels[0] ?? "")
                    : labels.length > 1
                      ? `${labels.length} selected items`
                      : "selection",
        };
    }, [selectedItems]);

    const getDerivedColumnPosition = useCallback(
        (sourceAnchorIds: string[]) => {
            const anchorPositions = (sourceAnchorIds || [])
                .map((anchorId) => positions[String(anchorId)])
                .filter(
                    (
                        item,
                    ): item is {
                        x: number;
                        y: number;
                    } => Boolean(item),
                );

            if (anchorPositions.length === 0) {
                const activePos = positions[activeColumnId] || { x: 550, y: 100 };
                return {
                    x: activePos.x + DERIVED_COLUMN_X_OFFSET,
                    y: activePos.y,
                };
            }

            const rightMost = Math.max(...anchorPositions.map((item) => item.x));
            const averageY =
                anchorPositions.reduce((sum, item) => sum + item.y, 0) /
                anchorPositions.length;
            const siblingCount = derivedColumns.filter((column: any) =>
                (column.sourceAnchorIds || []).some((anchorId: string) =>
                    sourceAnchorIds.includes(String(anchorId)),
                ),
            ).length;

            return {
                x: rightMost + DERIVED_COLUMN_X_OFFSET,
                y: averageY + siblingCount * DERIVED_COLUMN_Y_OFFSET,
            };
        },
        [activeColumnId, derivedColumns, positions],
    );

    const runDerivedAnalysis = useCallback(
        async ({
            mode,
            prompt = "",
            contexts,
            selectionRefs,
            sourceAnchorIds,
            titleHint = "",
            includeWeb = true,
        }: {
            mode: string;
            prompt?: string;
            contexts: any[];
            selectionRefs: any[];
            sourceAnchorIds: string[];
            titleHint?: string;
            includeWeb?: boolean;
        }) => {
            if (!contexts || contexts.length === 0) {
                notify({
                    title: "Nothing Selected",
                    message:
                        "Select one or more echoes or columns before running an analysis.",
                    tone: "warning",
                });
                return;
            }

            const derivedId = `derived_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 7)}`;
            const nextPos = getDerivedColumnPosition(sourceAnchorIds || []);
            const sourceEchoIds = Array.from(
                new Set(
                    [
                        ...(contexts || []).map((context: any) =>
                            String(context?.echo_id || ""),
                        ),
                        ...(selectionRefs || []).map((ref: any) =>
                            String(
                                ref?.echo_id ||
                                    (String(ref?.kind || "").includes("echo")
                                        ? ref?.id
                                        : ""),
                            ),
                        ),
                    ].filter(Boolean),
                ),
            );

            setPositions((prev) => ({
                ...prev,
                [derivedId]: nextPos,
            }));
            setDerivedColumns((prev) => [
                ...prev,
                {
                    id: derivedId,
                    mode,
                    title: titleHint || "Derived Analysis",
                    summary: "",
                    bullets: [],
                    followUps: [],
                    contexts,
                    selectionRefs,
                    sourceAnchorIds: sourceAnchorIds || [],
                    sourceEchoIds,
                    localEvidence: [],
                    webEvidence: [],
                    webStatus: includeWeb ? "pending" : "skipped",
                    webMessage: includeWeb
                        ? "Gathering live web evidence..."
                        : "Web retrieval skipped for this run.",
                    prompt,
                    includeWeb,
                    isLoading: true,
                    errorMessage: "",
                },
            ]);
            setZoomTarget(derivedId);

            try {
                const res = await ensureRolesThen(
                    [...analysisRequiredRoles],
                    () =>
                        axios.post(buildApiUrl("/echo/analysis/run"), {
                            mode,
                            prompt,
                            contexts,
                            selection_refs: selectionRefs,
                            include_web: includeWeb,
                            title_hint: titleHint,
                        }),
                );
                if (!res) {
                    setDerivedColumns((prev) =>
                        prev.map((column: any) =>
                            String(column.id) === String(derivedId)
                                ? {
                                      ...column,
                                      isLoading: false,
                                      errorMessage: "Analysis cancelled.",
                                  }
                                : column,
                        ),
                    );
                    return;
                }
                const payload = res.data?.data || res.data || {};

                setDerivedColumns((prev) =>
                    prev.map((column: any) =>
                        String(column.id) === String(derivedId)
                            ? {
                                  ...column,
                                  title:
                                      payload.title ||
                                      titleHint ||
                                      "Derived Analysis",
                                  modeLabel: payload.mode_label || mode,
                                  summary: payload.summary || "",
                                  bullets: Array.isArray(payload.bullets)
                                      ? payload.bullets
                                      : [],
                                  followUps: Array.isArray(payload.follow_ups)
                                      ? payload.follow_ups
                                      : [],
                                  contexts: Array.isArray(payload.contexts)
                                      ? payload.contexts
                                      : contexts,
                                  localEvidence: Array.isArray(
                                      payload.local_evidence,
                                  )
                                      ? payload.local_evidence
                                      : [],
                                  webEvidence: Array.isArray(
                                      payload.web_evidence,
                                  )
                                      ? payload.web_evidence
                                      : [],
                                  webStatus: payload.web_status || "disabled",
                                  webMessage:
                                      payload.web_message ||
                                      "No web evidence available.",
                                  prompt: payload.prompt ?? prompt,
                                  includeWeb:
                                      typeof payload.include_web === "boolean"
                                          ? payload.include_web
                                          : includeWeb,
                                  isLoading: false,
                                  errorMessage: "",
                              }
                            : column,
                    ),
                );
            } catch (error: any) {
                const errorPayload =
                    error?.response?.data?.detail || error?.response?.data || {};
                const errorMessage =
                    errorPayload?.message ||
                    error?.message ||
                    "The analysis could not be completed right now.";
                console.error("Derived analysis failed", error);
                setDerivedColumns((prev) =>
                    prev.map((column: any) =>
                        String(column.id) === String(derivedId)
                            ? {
                                  ...column,
                                  isLoading: false,
                                  errorMessage,
                              }
                            : column,
                    ),
                );
                notify({
                    title: "Analysis Failed",
                    message: errorMessage,
                    tone: "error",
                });
            }
        },
        [analysisRequiredRoles, ensureRolesThen, getDerivedColumnPosition],
    );

    const closeDerivedColumn = useCallback((derivedId: string) => {
        setDerivedColumns((prev) =>
            prev.filter((column: any) => String(column.id) !== String(derivedId)),
        );
        setSelectedCanvasItems((prev) => {
            const next = { ...prev };
            delete next[`derived-column:${derivedId}`];
            return next;
        });
    }, []);

    const saveDerivedColumn = useCallback(
        async (derivedId: string) => {
            const target = derivedColumns.find(
                (column: any) => String(column.id) === String(derivedId),
            );
            if (!target || !target.summary) return;

            try {
                const res = await axios.post(buildApiUrl("/echo/analysis/save"), {
                    mode: target.mode,
                    title: target.title || "Derived Analysis",
                    summary: target.summary,
                    prompt: target.prompt || "",
                    include_web: Boolean(target.includeWeb),
                    contexts: target.contexts || [],
                    selection_refs: target.selectionRefs || [],
                    local_evidence: target.localEvidence || [],
                    web_evidence: target.webEvidence || [],
                    follow_ups: target.followUps || [],
                    source_anchor_ids: target.sourceAnchorIds || [],
                });

                if (res.data?.status !== "success" || !res.data?.cluster_id) {
                    throw new Error(
                        res.data?.message || "The derived column could not be saved.",
                    );
                }

                closeDerivedColumn(derivedId);
                await refreshCanvasSnapshot();
                setZoomTarget(String(res.data.cluster_id));
                setHighlightId(String(res.data.cluster_id));
                window.setTimeout(() => setHighlightId(null), 1200);
            } catch (error) {
                console.error("Failed to save derived column", error);
                notify({
                    title: "Save Failed",
                    message: "The derived column could not be saved right now.",
                    tone: "error",
                });
            }
        },
        [closeDerivedColumn, derivedColumns, refreshCanvasSnapshot],
    );

    const openSelectionRagComposer = useCallback(() => {
        if (!selectionPayload.contexts.length) {
            notify({
                title: "Nothing Selected",
                message:
                    "Select a column or echo before asking a RAG question.",
                tone: "warning",
            });
            return;
        }
        setRagComposerState({
            open: true,
            prompt: "",
            contexts: selectionPayload.contexts,
            selectionRefs: selectionPayload.selectionRefs,
            sourceAnchorIds: selectionPayload.sourceAnchorIds,
            titleHint: selectionPayload.titleHint || "",
            includeWeb: true,
            scopeLabel: selectionPayload.scopeLabel || "selection",
        });
    }, [selectionPayload]);

    const openHighlightRagComposer = useCallback(
        ({
            text,
            title,
            chapter = "",
            sourceLabel = "",
            sourceAnchorId = "",
            selectionRefs = [],
            contextExtras = {},
        }: {
            text: string;
            title: string;
            chapter?: string;
            sourceLabel?: string;
            sourceAnchorId?: string;
            selectionRefs?: any[];
            contextExtras?: Record<string, any>;
        }) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            setRagComposerState({
                open: true,
                prompt: "",
                contexts: [
                    {
                        context_id: `highlight:${Date.now()}`,
                        kind: "highlight",
                        anchor_id: sourceAnchorId,
                        title,
                        text: trimmed,
                        chapter,
                        source_label: sourceLabel,
                        ...contextExtras,
                    },
                ],
                selectionRefs,
                sourceAnchorIds: sourceAnchorId ? [sourceAnchorId] : [],
                titleHint: title,
                includeWeb: true,
                scopeLabel: title,
            });
        },
        [],
    );

    const closeRagComposer = useCallback(() => {
        setRagComposerState({
            open: false,
            prompt: "",
            contexts: [],
            selectionRefs: [],
            sourceAnchorIds: [],
            titleHint: "",
            includeWeb: true,
            scopeLabel: "",
        });
    }, []);

    const setRagComposerPrompt = useCallback((prompt: string) => {
        setRagComposerState((prev) => ({ ...prev, prompt }));
    }, []);

    const submitRagComposer = useCallback(async () => {
        const prompt = ragComposerState.prompt.trim();
        if (!prompt) {
            notify({
                title: "Add A Question",
                message: "Enter the question you want RAG to answer.",
                tone: "warning",
            });
            return;
        }
        const currentComposer = ragComposerState;
        closeRagComposer();
        await runDerivedAnalysis({
            mode: "rag",
            prompt,
            contexts: currentComposer.contexts,
            selectionRefs: currentComposer.selectionRefs,
            sourceAnchorIds: currentComposer.sourceAnchorIds,
            titleHint: currentComposer.titleHint || prompt,
            includeWeb: currentComposer.includeWeb,
        });
    }, [closeRagComposer, ragComposerState, runDerivedAnalysis]);

    const runSelectionAnalysis = useCallback(
        async (mode: string) => {
            if (!selectionPayload.contexts.length) {
                notify({
                    title: "Nothing Selected",
                    message:
                        "Select a column or echo before running an analysis.",
                    tone: "warning",
                });
                return;
            }
            await runDerivedAnalysis({
                mode,
                prompt: "",
                contexts: selectionPayload.contexts,
                selectionRefs: selectionPayload.selectionRefs,
                sourceAnchorIds: selectionPayload.sourceAnchorIds,
                titleHint: selectionPayload.titleHint || "",
                includeWeb: true,
            });
        },
        [runDerivedAnalysis, selectionPayload],
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
            spawnBasePosition,
        }: {
            text: string;
            sourceEchoId: string;
            parentClusterId: string;
            parentClusterTitle: string;
            bookId: string;
            libraryId: string;
            spawnBasePosition?: { x: number; y: number };
        }) => {
            const highlightText = text.trim();
            if (!highlightText) return;

            const draftId = `draft_branch_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 7)}`;
            const parentPos = positions[parentClusterId] || spawnBasePosition || {
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

    useEffect(() => {
        if (!isOpen) return;
        const pendingRaw = sessionStorage.getItem("pendingDerivedAction");
        if (!pendingRaw) return;

        try {
            const pending = JSON.parse(pendingRaw);
            sessionStorage.removeItem("pendingDerivedAction");

            if (pending?.type === "rag" && pending?.highlight && pending?.prompt) {
                runDerivedAnalysis({
                    mode: "rag",
                    prompt: String(pending.prompt),
                    contexts: [
                        {
                            context_id: `external-rag:${Date.now()}`,
                            kind: "highlight",
                            anchor_id: activeColumnId,
                            title: activeBookTitle || "Selected Highlight",
                            text: String(pending.highlight),
                            chapter: "Reader Highlight",
                            source_label: activeBookTitle || "Current Focus",
                            book_id: activeBookTitle || "Current Focus",
                            library_id: libraryId || "",
                        },
                    ],
                    selectionRefs: [
                        {
                            kind: "highlight",
                            id: "external-highlight",
                            label: activeBookTitle || "Reader Highlight",
                        },
                    ],
                    sourceAnchorIds: [activeColumnId],
                    titleHint: activeBookTitle || "Reader Highlight",
                    includeWeb: true,
                });
            }
        } catch (error) {
            console.error("Failed to restore pending derived action", error);
            sessionStorage.removeItem("pendingDerivedAction");
        }
    }, [activeBookTitle, activeColumnId, isOpen, libraryId, runDerivedAnalysis]);

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
        derivedColumns,
        visibleDerivedColumns,
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
        handleEchoSaved,
        createDraftBranchFromHighlight,
        ensureDraftBranchCluster,
        handleDraftBranchSaved,
        closeDraftBranch,
        closeDerivedColumn,
        saveDerivedColumn,
        focusBranchesForEcho,
        toggleStack,
        bringToFront,
        updatePosition,
        isCanvasWheelDisabled,
        setIsCanvasWheelDisabled,
        handleRenameCluster,
        handleDeleteCluster,
        selectionMode,
        toggleSelectionMode,
        clearSelections,
        toggleCanvasSelection,
        isCanvasItemSelected,
        selectedItems,
        selectionPayload,
        runSelectionAnalysis,
        openSelectionRagComposer,
        openHighlightRagComposer,
        ragComposerState,
        closeRagComposer,
        setRagComposerPrompt,
        submitRagComposer,
    };
}
