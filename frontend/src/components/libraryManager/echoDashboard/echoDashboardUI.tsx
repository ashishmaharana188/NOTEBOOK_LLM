import React from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import axios from "axios";
import { IonIcon } from "@ionic/react";
import {
  addOutline,
  chatbubbleEllipsesOutline,
  closeOutline,
  linkOutline,
  removeOutline,
  scanOutline,
  sparklesOutline,
} from "ionicons/icons";

import type { EchoChunk, EchoRecommendation } from "./echoTypes";
import NotesFormUI from "../noteModule/notesFormUI";
import AutoZoomTrigger from "./components/AutoZoomTrigger";
import DerivedAnalysisColumn from "./components/DerivedAnalysisColumn";
import DraftBranchColumn from "./components/DraftBranchColumn";
import DraggableColumn from "./components/DraggableColumn";
import InteractiveChunkCard from "./components/InteractiveChunkCard";
import MaximizedColumnView from "./components/MaximizedColumnView";
import SavedClusterColumn from "./components/SavedClusterColumn";
import FloatingNoteModal from "./modals/FloatingNoteModal";
import useEchoDashboardState from "./hooks/useEchoDashboardState";
import { useRefreshBus } from "../../system/RefreshBusProvider";
import { notify } from "../../system/AppNotifications";
import { buildApiUrl } from "../../../lib/runtimeConfig";
import useCanvasViewport from "../../../hooks/appTools/useCanvasViewport";
import useCanvasInteractionMode from "../../../hooks/appTools/useCanvasInteractionMode";

const INCOMING_COLUMN_WIDTH = 560;
const SAVED_COLUMN_WIDTH = 470;
const DRAFT_COLUMN_WIDTH = 560;
const ECHO_COLUMN_HEIGHT = 780;
const ANALYSIS_EDGE_COLORS: Record<string, string> = {
  rag: "#1d4ed8",
  cross_pollination: "#c2410c",
  friction: "#b91c1c",
  gap: "#0f766e",
};

function getEdgePresentation(edge: any) {
  const normalizedMode = String(edge.mode || "").trim();
  const stroke =
    ANALYSIS_EDGE_COLORS[normalizedMode] ||
    (String(edge.columnKind || "") === "rag"
      ? ANALYSIS_EDGE_COLORS.rag
      : "#64748b");
  const edgeStyle = String(edge.edgeStyle || "dashed");
  return {
    stroke,
    strokeWidth: edgeStyle === "secondary" ? "2.5" : "3",
    opacity: edgeStyle === "secondary" ? "0.68" : "0.84",
    strokeDasharray:
      edgeStyle === "dashed" || edgeStyle === "secondary" ? "6 6" : "0",
  };
}

export default function EchoDashboardUI(props: any) {
  const { publish } = useRefreshBus();
  const { isInteracting, startInteraction, settleInteraction } =
    useCanvasInteractionMode(140);
  const state = useEchoDashboardState(props);
  const ragInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isAnalyzeMenuOpen, setIsAnalyzeMenuOpen] = React.useState(false);
  const {
    recommendations = [],
    query = "",
    loading = false,
    activeBookTitle = "Current Focus",
    libraryId = "",
  } = props;
  const { canvasScale, syncViewport, isRectVisible } = useCanvasViewport({
    initialScale: 0.6,
    initialPositionX: 0,
    initialPositionY: 0,
    buffer: 1800,
  });

  // --- FIX 1: Direct to Note Editor Bypass ---
  const handleCreateNoteFromEcho = (echoData: any) => {
    state.setEchoNoteState({
      isOpen: true,
      groupId: "", // Explicitly start Unfiled to use the smart NotesFormUI flow
      prefill: echoData.markdown,
      prefillTitle: echoData.title,
      echoId: echoData.echoId,
      initialNote: undefined,
    });
  };

  // --- FIX 2: Hide Note Stacks from rendering as Echo Clusters! ---
  const echoClusters = React.useMemo(
    () =>
      (state.visibleSavedClusters || []).filter((cluster: any) => {
        const isNoteStack = state.stacks?.some(
          (stack: any) => String(stack.stack_id) === String(cluster.id),
        );
        return !isNoteStack;
      }),
    [state.stacks, state.visibleSavedClusters],
  );
  const draftBranches = React.useMemo(
    () => state.visibleDraftBranches || [],
    [state.visibleDraftBranches],
  );
  const activeColumnPos = state.positions[state.activeColumnId] || {
    x: 0,
    y: 0,
  };
  const activeColumnVisible = isRectVisible({
    x: activeColumnPos.x,
    y: activeColumnPos.y,
    width: INCOMING_COLUMN_WIDTH,
    height: ECHO_COLUMN_HEIGHT,
  });
  const visibleEchoClusters = React.useMemo(
    () =>
      echoClusters.filter((cluster: any) => {
        if (String(state.zoomTarget || "") === String(cluster.id || "")) {
          return true;
        }
        const position = state.positions[cluster.id] || {
          x: 1000,
          y: 100,
        };
        return isRectVisible({
          x: position.x,
          y: position.y,
          width: SAVED_COLUMN_WIDTH,
          height: ECHO_COLUMN_HEIGHT,
        });
      }),
    [echoClusters, isRectVisible, state.positions, state.zoomTarget],
  );
  const visibleDraftBranchColumns = React.useMemo(
    () =>
      draftBranches.filter((draft: any) => {
        if (String(state.zoomTarget || "") === String(draft.id || "")) {
          return true;
        }
        const position = state.positions[draft.id] || { x: 1000, y: 100 };
        return isRectVisible({
          x: position.x,
          y: position.y,
          width: DRAFT_COLUMN_WIDTH,
          height: ECHO_COLUMN_HEIGHT,
        });
      }),
    [draftBranches, isRectVisible, state.positions, state.zoomTarget],
  );
  const visibleDerivedColumns = React.useMemo(
    () =>
      (state.visibleDerivedColumns || []).filter((derived: any) => {
        if (String(state.zoomTarget || "") === String(derived.id || "")) {
          return true;
        }
        const position = state.positions[derived.id] || { x: 1180, y: 100 };
        return isRectVisible({
          x: position.x,
          y: position.y,
          width: DRAFT_COLUMN_WIDTH,
          height: ECHO_COLUMN_HEIGHT,
        });
      }),
    [
      isRectVisible,
      state.positions,
      state.visibleDerivedColumns,
      state.zoomTarget,
    ],
  );
  const createWorkspaceItemFromChunk = React.useCallback(
    (
      chunk: any,
      options: {
        title?: string;
        clusterId?: string;
        sourceAnchorId?: string;
        bookId?: string;
        libraryId?: string;
      } = {},
    ) => ({
      id: String(
        chunk.echo_id || chunk.chunk_id || chunk.note_id || `${Date.now()}`,
      ),
      title: chunk.title || options.title || activeBookTitle || "Focused Echo",
      text: String(chunk.text || chunk.bridge || ""),
      fullText: String((chunk as any).full_text || ""),
      chapter: chunk.chapter || "",
      sourceLabel: String(chunk.filename || activeBookTitle || ""),
      filename: String(chunk.filename || ""),
      chunkId: String(chunk.chunk_id || ""),
      echoId: String(chunk.echo_id || ""),
      clusterId: String(options.clusterId || (chunk as any).cluster_id || ""),
      sourceAnchorId: String(
        options.sourceAnchorId ||
          options.clusterId ||
          (chunk as any).cluster_id ||
          state.activeColumnId,
      ),
      bookId: String(options.bookId || activeBookTitle || ""),
      libraryId: String(options.libraryId || libraryId || ""),
      kind: chunk.note_id ? "note" : "echo",
    }),
    [activeBookTitle, libraryId, state.activeColumnId],
  );
  const openIncomingWorkspace = React.useCallback(
    (bookGroup: any, chunk: any) => {
      const items = (bookGroup?.chunks || []).map((bookChunk: any) =>
        createWorkspaceItemFromChunk(bookChunk, {
          title: bookChunk.title || bookGroup?.title || activeBookTitle,
          bookId: activeBookTitle,
          libraryId,
          sourceAnchorId: state.activeColumnId,
        }),
      );
      state.openAdhocReader({
        title: bookGroup?.title || activeBookTitle || "Focused Reading",
        subtitle: "Incoming echoes",
        initialEchoId: String(chunk.echo_id || chunk.chunk_id || ""),
        items,
      });
    },
    [
      activeBookTitle,
      createWorkspaceItemFromChunk,
      libraryId,
      state.activeColumnId,
      state.openAdhocReader,
    ],
  );
  const visibleEchoClusterIds = React.useMemo(
    () =>
      new Set([
        ...visibleEchoClusters.map((cluster: any) => String(cluster.id)),
        ...visibleDraftBranchColumns.map((draft: any) => String(draft.id)),
        ...visibleDerivedColumns.map((derived: any) => String(derived.id)),
      ]),
    [visibleDerivedColumns, visibleDraftBranchColumns, visibleEchoClusters],
  );
  const visibleEchoEdges = React.useMemo(() => {
    const branchColumns = [
      ...echoClusters.map((cluster: any) => ({
        id: String(cluster.id),
        parentId: String(cluster.parent_cluster_id || ""),
      })),
      ...draftBranches.map((draft: any) => ({
        id: String(draft.id),
        parentId: String(draft.parentClusterId || ""),
      })),
    ];

    return branchColumns.filter((cluster: any) => {
      if (!cluster.parentId) return false;
      const start = state.positions[cluster.parentId];
      const end = state.positions[cluster.id];
      if (!start || !end) return false;
      if (
        visibleEchoClusterIds.has(String(cluster.id)) ||
        visibleEchoClusterIds.has(String(cluster.parentId))
      ) {
        return true;
      }
      const edgeLeft = Math.min(start.x + SAVED_COLUMN_WIDTH, end.x);
      const edgeTop = Math.min(start.y, end.y);
      return isRectVisible({
        x: edgeLeft,
        y: edgeTop,
        width: Math.abs(end.x - (start.x + SAVED_COLUMN_WIDTH)) || 1,
        height: Math.abs(end.y - start.y) + 160,
      });
    });
  }, [
    draftBranches,
    echoClusters,
    isRectVisible,
    state.positions,
    visibleEchoClusterIds,
  ]);
  const getColumnWidthForId = React.useCallback(
    (columnId: string) => {
      if (String(columnId) === String(state.activeColumnId)) {
        return INCOMING_COLUMN_WIDTH;
      }
      if (
        draftBranches.some(
          (draft: any) => String(draft.id) === String(columnId),
        ) ||
        (state.visibleDerivedColumns || []).some(
          (derived: any) => String(derived.id) === String(columnId),
        )
      ) {
        return DRAFT_COLUMN_WIDTH;
      }
      return SAVED_COLUMN_WIDTH;
    },
    [draftBranches, state.activeColumnId, state.visibleDerivedColumns],
  );
  const visibleDerivedEdges = React.useMemo(
    () =>
      (visibleDerivedColumns || []).flatMap((derived: any) =>
        (derived.sourceAnchorIds || [])
          .filter(Boolean)
          .map((anchorId: string) => ({
            id: `derived-edge:${anchorId}:${derived.id}`,
            parentId: String(anchorId),
            childId: String(derived.id),
          }))
          .filter((edge: any) => {
            const start = state.positions[edge.parentId];
            const end = state.positions[edge.childId];
            if (!start || !end) return false;
            if (
              visibleEchoClusterIds.has(String(edge.parentId)) ||
              visibleEchoClusterIds.has(String(edge.childId))
            ) {
              return true;
            }
            return isRectVisible({
              x: Math.min(start.x, end.x),
              y: Math.min(start.y, end.y),
              width: Math.abs(end.x - start.x) + DRAFT_COLUMN_WIDTH,
              height: Math.abs(end.y - start.y) + 160,
            });
          }),
      ),
    [
      isRectVisible,
      state.positions,
      visibleDerivedColumns,
      visibleEchoClusterIds,
    ],
  );
  const branchCountByEchoId = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(state.branchesBySourceEchoId || {}).map(
          ([echoId, branches]) => [
            echoId,
            Array.isArray(branches) ? branches.length : 0,
          ],
        ),
      ),
    [state.branchesBySourceEchoId],
  );
  const buildContextFromChunk = React.useCallback(
    (
      chunk: any,
      {
        contextId,
        kind = "echo",
        anchorId = "",
        title = "",
        chapter = "",
        sourceLabel = "",
        echoId = "",
        clusterId = "",
        bookId = "",
        itemLibraryId = "",
      }: any = {},
    ) => ({
      context_id:
        contextId ||
        `${kind}:${echoId || chunk.echo_id || chunk.chunk_id || chunk.filename || "context"}`,
      kind,
      anchor_id: anchorId,
      title:
        title ||
        chunk.title ||
        chunk.bridge ||
        sourceLabel ||
        "Selected Context",
      text: chunk.text || chunk.bridge || "",
      chapter: chapter || chunk.chapter || "Unknown Chapter",
      source_label: sourceLabel || chunk.filename || title || "",
      echo_id: echoId || String(chunk.echo_id || ""),
      cluster_id: clusterId || String(chunk.cluster_id || ""),
      book_id: bookId || "",
      library_id: itemLibraryId || "",
    }),
    [],
  );
  const createIncomingColumnSelection = React.useCallback(
    () => ({
      key: `column:${state.activeColumnId}`,
      label: activeBookTitle || "Incoming Echoes",
      anchorId: state.activeColumnId,
      contexts: (state.unsavedEchoes || []).flatMap((group: any) =>
        (group.chunks || []).map((chunk: any, index: number) =>
          buildContextFromChunk(chunk, {
            contextId: `incoming-column:${group.id || group.title}:${index}`,
            kind: "column_echo",
            anchorId: state.activeColumnId,
            title: chunk.title || group.title || activeBookTitle,
            chapter: chunk.chapter,
            sourceLabel: group.title || activeBookTitle,
            bookId: activeBookTitle,
            itemLibraryId: libraryId,
          }),
        ),
      ),
      selectionRefs: [
        {
          kind: "column",
          id: state.activeColumnId,
          label: activeBookTitle || "Incoming Echoes",
        },
      ],
    }),
    [
      activeBookTitle,
      buildContextFromChunk,
      libraryId,
      state.activeColumnId,
      state.unsavedEchoes,
    ],
  );
  const createIncomingEchoSelection = React.useCallback(
    (group: any, chunk: any, chunkIndex: number) => {
      const chunkKey = `incoming-echo:${group.id || group.title}:${chunk.echo_id || chunk.chunk_id || chunkIndex}`;
      return {
        key: chunkKey,
        label: chunk.title || group.title || activeBookTitle || "Incoming Echo",
        anchorId: state.activeColumnId,
        contexts: [
          buildContextFromChunk(chunk, {
            contextId: chunkKey,
            kind: "incoming_echo",
            anchorId: state.activeColumnId,
            title: chunk.title || group.title || activeBookTitle,
            chapter: chunk.chapter,
            sourceLabel: group.title || activeBookTitle,
            bookId: activeBookTitle,
            itemLibraryId: libraryId,
          }),
        ],
        selectionRefs: [
          {
            kind: "incoming_echo",
            id: String(chunk.echo_id || chunk.chunk_id || chunkIndex),
            label:
              chunk.title || group.title || activeBookTitle || "Incoming Echo",
          },
        ],
      };
    },
    [activeBookTitle, buildContextFromChunk, libraryId, state.activeColumnId],
  );
  const createSavedClusterSelection = React.useCallback(
    (cluster: any) => ({
      key: `saved-column:${cluster.id}`,
      label: cluster.title || "Saved Column",
      anchorId: String(cluster.id),
      contexts: (cluster.chunks || [])
        .filter((item: any) => item.type !== "note" && !item.note_id)
        .map((chunk: any, index: number) =>
          buildContextFromChunk(chunk, {
            contextId: `saved-column:${cluster.id}:${chunk.echo_id || chunk.chunk_id || index}`,
            kind: "saved_echo",
            anchorId: String(cluster.id),
            title: chunk.title || cluster.title,
            chapter: chunk.chapter,
            sourceLabel: chunk.filename || cluster.title,
            echoId: String(chunk.echo_id || ""),
            clusterId: String(cluster.id),
            bookId: cluster.book_id || cluster.title,
            itemLibraryId: cluster.library_id || "",
          }),
        ),
      selectionRefs: [
        {
          kind: "column",
          id: String(cluster.id),
          label: cluster.title || "Saved Column",
          cluster_id: String(cluster.id),
        },
      ],
    }),
    [buildContextFromChunk],
  );
  const createSavedEchoSelection = React.useCallback(
    (cluster: any, chunk: any) => ({
      key: `saved-echo:${cluster.id}:${chunk.echo_id || chunk.chunk_id}`,
      label: chunk.title || cluster.title || "Saved Echo",
      anchorId: String(cluster.id),
      contexts: [
        buildContextFromChunk(chunk, {
          contextId: `saved-echo:${cluster.id}:${chunk.echo_id || chunk.chunk_id}`,
          kind: "saved_echo",
          anchorId: String(cluster.id),
          title: chunk.title || cluster.title,
          chapter: chunk.chapter,
          sourceLabel: chunk.filename || cluster.title,
          echoId: String(chunk.echo_id || ""),
          clusterId: String(cluster.id),
          bookId: cluster.book_id || cluster.title,
          itemLibraryId: cluster.library_id || "",
        }),
      ],
      selectionRefs: [
        {
          kind: "echo",
          id: String(chunk.echo_id || chunk.chunk_id || ""),
          label: chunk.title || cluster.title || "Saved Echo",
          cluster_id: String(cluster.id),
          echo_id: String(chunk.echo_id || ""),
        },
      ],
    }),
    [buildContextFromChunk],
  );
  const createDraftColumnSelection = React.useCallback(
    (draft: any) => ({
      key: `draft-column:${draft.id}`,
      label: draft.title || "Draft Branch",
      anchorId: String(draft.id),
      contexts: (draft.resultGroups || []).flatMap(
        (group: any, groupIndex: number) =>
          (group.chunks || []).map((chunk: any, chunkIndex: number) =>
            buildContextFromChunk(chunk, {
              contextId: `draft-column:${draft.id}:${groupIndex}:${chunk.echo_id || chunk.chunk_id || chunkIndex}`,
              kind: "draft_echo",
              anchorId: String(draft.id),
              title: chunk.title || group.title || draft.title,
              chapter: chunk.chapter,
              sourceLabel: group.title || draft.title,
              echoId: String(chunk.echo_id || ""),
              clusterId: String(draft.persistedClusterId || ""),
              bookId: draft.bookId || draft.title,
              itemLibraryId: draft.libraryId || "",
            }),
          ),
      ),
      selectionRefs: [
        {
          kind: "draft_column",
          id: String(draft.id),
          label: draft.title || "Draft Branch",
          cluster_id: String(draft.persistedClusterId || ""),
        },
      ],
    }),
    [buildContextFromChunk],
  );
  const createDraftEchoSelection = React.useCallback(
    (draft: any, group: any, chunk: any, chunkIndex: number) => ({
      key: `draft-echo:${draft.id}:${chunk.echo_id || chunk.chunk_id || chunkIndex}`,
      label: chunk.title || group.title || draft.title || "Draft Echo",
      anchorId: String(draft.id),
      contexts: [
        buildContextFromChunk(chunk, {
          contextId: `draft-echo:${draft.id}:${chunk.echo_id || chunk.chunk_id || chunkIndex}`,
          kind: "draft_echo",
          anchorId: String(draft.id),
          title: chunk.title || group.title || draft.title,
          chapter: chunk.chapter,
          sourceLabel: group.title || draft.title,
          echoId: String(chunk.echo_id || ""),
          clusterId: String(draft.persistedClusterId || ""),
          bookId: draft.bookId || draft.title,
          itemLibraryId: draft.libraryId || "",
        }),
      ],
      selectionRefs: [
        {
          kind: "draft_echo",
          id: String(chunk.echo_id || chunk.chunk_id || chunkIndex),
          label: chunk.title || group.title || draft.title || "Draft Echo",
          cluster_id: String(draft.persistedClusterId || ""),
          echo_id: String(chunk.echo_id || ""),
        },
      ],
    }),
    [buildContextFromChunk],
  );
  const createDerivedColumnSelection = React.useCallback(
    (derived: any) => ({
      key: `derived-column:${derived.id}`,
      label: derived.title || "Derived Analysis",
      anchorId: String(derived.id),
      contexts: [
        {
          context_id: `derived-summary:${derived.id}`,
          kind: "derived_summary",
          anchor_id: String(derived.id),
          title: derived.title || "Derived Analysis",
          text: derived.summary || "",
          chapter: derived.modeLabel || derived.mode || "Derived Analysis",
          source_label: derived.modeLabel || "Derived Analysis",
          echo_id: "",
          cluster_id: "",
          book_id: derived.title || "Derived Analysis",
          library_id: "",
        },
      ],
      selectionRefs: [
        {
          kind: "derived_column",
          id: String(derived.id),
          label: derived.title || "Derived Analysis",
        },
      ],
    }),
    [],
  );
  const createIncomingHighlightBranch = React.useCallback(
    async ({
      text,
      echoId,
      clusterId,
    }: {
      text: string;
      echoId: string;
      clusterId: string;
    }) => {
      const cluster =
        (state.savedGlobalClusters || []).find(
          (entry: any) =>
            String(entry.id || entry.cluster_id || "") === String(clusterId),
        ) ||
        (state.savedGlobalClusters || []).find((entry: any) => entry.is_active);
      const resolvedClusterId = String(
        cluster?.id || cluster?.cluster_id || clusterId || "",
      );

      if (!resolvedClusterId) {
        return;
      }

      state.handleEchoSaved({
        echoId,
        clusterId: resolvedClusterId,
        created: false,
      });

      await state.createDraftBranchFromHighlight({
        text,
        sourceEchoId: echoId,
        parentClusterId: resolvedClusterId,
        parentClusterTitle: cluster?.title || activeBookTitle,
        bookId: cluster?.book_id || activeBookTitle,
        libraryId: cluster?.library_id || libraryId,
        spawnBasePosition: activeColumnPos,
      });
    },
    [
      activeColumnPos,
      activeBookTitle,
      libraryId,
      state.createDraftBranchFromHighlight,
      state.handleEchoSaved,
      state.savedGlobalClusters,
    ],
  );

  const createDerivedHighlightBranch = React.useCallback(
    async ({
      text,
      derived,
      item,
    }: {
      text: string;
      derived: any;
      item: any;
    }) => {
      const nextSelection = String(text || "").trim();
      if (!nextSelection) return;

      const sourceEchoId = String(
        item?.echo_id ||
          derived?.sourceEchoIds?.find?.((value: any) =>
            String(value || "").trim(),
          ) ||
          derived?.contexts?.find?.((context: any) =>
            String(context?.echo_id || "").trim(),
          )?.echo_id ||
          "",
      );
      const parentClusterId = String(
        item?.cluster_id ||
          derived?.selectionRefs?.find?.((ref: any) =>
            String(ref?.cluster_id || "").trim(),
          )?.cluster_id ||
          derived?.contexts?.find?.((context: any) =>
            String(context?.cluster_id || "").trim(),
          )?.cluster_id ||
          "",
      );

      const parentCluster = (state.savedGlobalClusters || []).find(
        (entry: any) =>
          String(entry.id || entry.cluster_id || "") ===
          String(parentClusterId),
      );

      if (!sourceEchoId || !parentClusterId || !parentCluster) {
        notify({
          title: "Branch Search Unavailable",
          message:
            "This derived section is not anchored to a saved echo yet. Run highlight search from a saved echo, or save the derived result first.",
          tone: "warning",
        });
        return;
      }

      state.handleEchoSaved({
        echoId: sourceEchoId,
        clusterId: parentClusterId,
        created: false,
      });

      await state.createDraftBranchFromHighlight({
        text: nextSelection,
        sourceEchoId,
        parentClusterId,
        parentClusterTitle:
          parentCluster.title ||
          item?.title ||
          derived?.title ||
          activeBookTitle,
        bookId:
          item?.book_id ||
          parentCluster.book_id ||
          parentCluster.title ||
          activeBookTitle,
        libraryId: item?.library_id || parentCluster.library_id || libraryId,
        spawnBasePosition: state.positions[derived.id] || activeColumnPos,
      });
    },
    [
      activeBookTitle,
      activeColumnPos,
      libraryId,
      state.createDraftBranchFromHighlight,
      state.handleEchoSaved,
      state.positions,
      state.savedGlobalClusters,
    ],
  );
  const handleViewportUpdate = React.useCallback(
    (ref: any) => {
      syncViewport(ref);
      state.setCanvasScale(ref?.state?.scale || 1);
    },
    [state.setCanvasScale, syncViewport],
  );

  return (
    <>
      <div className="relative h-full w-full">
        <TransformWrapper
          initialScale={0.6}
          initialPositionX={0}
          initialPositionY={0}
          minScale={0.1}
          maxScale={3}
          limitToBounds={false}
          centerZoomedOut={false}
          wheel={{
            step: 0.1,
            smoothStep: 0.0005,
            disabled: state.isCanvasWheelDisabled,
          }}
          panning={{ excluded: ["no-pan"] }}
          onInit={handleViewportUpdate}
          onWheelStart={() => startInteraction()}
          onWheelStop={(ref) => {
            handleViewportUpdate(ref);
            settleInteraction();
          }}
          onPanningStart={() => startInteraction()}
          onPanningStop={(ref) => {
            handleViewportUpdate(ref);
            settleInteraction();
          }}
          onZoomStart={() => startInteraction()}
          onZoomStop={(ref) => {
            handleViewportUpdate(ref);
            settleInteraction();
          }}
        >
          {({ zoomIn, zoomOut, zoomToElement }) => (
            <>
              <AutoZoomTrigger
                targetId={state.zoomTarget}
                zoomToElement={zoomToElement}
                onZoomed={() => state.setZoomTarget(null)}
              />
              <div className="absolute bottom-3 left-3 z-[2000] flex flex-col gap-1 rounded-sm border border-border-subtle bg-surface/95 p-1.5 shadow-sm pointer-events-auto sm:bottom-6 sm:left-6">
                <button
                  onClick={() => zoomIn(0.2)}
                  className="p-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-sm transition-colors"
                >
                  <IonIcon icon={addOutline} className="w-4 h-4" />
                </button>
                <div className="text-[9px] font-mono font-bold text-center text-muted py-1 border-y border-slate-100 w-full">
                  {Math.round(canvasScale * 100)}%
                </div>
                <button
                  onClick={() => zoomOut(0.2)}
                  className="p-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-sm transition-colors"
                >
                  <IonIcon icon={removeOutline} className="w-4 h-4" />
                </button>
                <button
                  onClick={() => zoomToElement("cards-bounding-box", 1, 600)}
                  className="p-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-sm transition-colors mt-1 border-t border-slate-100 flex flex-col items-center justify-center"
                >
                  <IonIcon icon={scanOutline} className="w-4 h-4" />
                </button>
              </div>

              <TransformComponent
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                }}
              >
                <div
                  className={`relative w-0 h-0 [text-rendering:optimizeLegibility] ${
                    isInteracting ? "canvas-interaction-reduced" : ""
                  }`}
                >
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: -15000,
                      top: -15000,
                      width: "30000px",
                      height: "30000px",
                      backgroundImage:
                        "radial-gradient(#d9dde4 1.1px, transparent 1.1px)",
                      backgroundColor: "#ffffff",
                      backgroundSize: "24px 24px",
                      zIndex: 0,
                    }}
                  />
                  <div
                    id="cards-bounding-box"
                    className="absolute pointer-events-none"
                    style={{
                      left: activeColumnPos.x - 50,
                      top: activeColumnPos.y - 50,
                      width: INCOMING_COLUMN_WIDTH + 80,
                      height: 800,
                    }}
                  />

                  <svg
                    className="absolute pointer-events-none"
                    style={{
                      left: -15000,
                      top: -15000,
                      width: 30000,
                      height: 30000,
                      zIndex: 0,
                    }}
                  >
                    <g transform="translate(15000, 15000)">
                      {[...visibleEchoEdges, ...visibleDerivedEdges].map(
                        (c) => {
                          const start = state.positions[c.parentId];
                          const childId = c.childId || c.id;
                          const end = state.positions[childId];
                          if (!start || !end) return null;
                          const edgePresentation = getEdgePresentation(c);
                          const startX =
                            start.x + getColumnWidthForId(c.parentId);
                          const startY = start.y + 80;
                          const endX = end.x;
                          const endY = end.y + 80;
                          const cpOffset = Math.max(
                            150,
                            Math.abs(endX - startX) * 0.45,
                          );
                          return (
                            <path
                              key={`edge-${childId}-${c.parentId}`}
                              d={`M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX} ${endY}`}
                              stroke={edgePresentation.stroke}
                              strokeWidth={edgePresentation.strokeWidth}
                              fill="none"
                              opacity={edgePresentation.opacity}
                              strokeDasharray={edgePresentation.strokeDasharray}
                            />
                          );
                        },
                      )}
                    </g>
                  </svg>

                  {state.showInbox && activeColumnVisible && (
                    <DraggableColumn
                      id={state.activeColumnId}
                      title={activeBookTitle}
                      author="Incoming Echoes"
                      initialPos={
                        state.positions[state.activeColumnId] || {
                          x: 120,
                          y: 100,
                        }
                      }
                      onDragEnd={state.updatePosition}
                      zIndex={state.zIndexes[state.activeColumnId] || 1}
                      bringToFront={state.bringToFront}
                      scale={canvasScale}
                      interactionReduced={isInteracting}
                      defaultWidth={INCOMING_COLUMN_WIDTH}
                      defaultHeight={ECHO_COLUMN_HEIGHT}
                      selectionMode={state.selectionMode}
                      isSelected={state.isCanvasItemSelected(
                        `column:${state.activeColumnId}`,
                      )}
                      onMaximize={() => {
                        const items = (state.unsavedEchoes || []).flatMap(
                          (group: any) =>
                            (group?.chunks || []).map((chunk: any) =>
                              createWorkspaceItemFromChunk(chunk, {
                                title:
                                  chunk.title ||
                                  group?.title ||
                                  activeBookTitle,
                                bookId: activeBookTitle,
                                libraryId,
                                sourceAnchorId: state.activeColumnId,
                              }),
                            ),
                        );
                        state.openAdhocReader({
                          title: activeBookTitle || "Focused Reading",
                          subtitle: "Incoming echoes",
                          initialEchoId: String(items[0]?.id || ""),
                          items,
                        });
                      }}
                      onToggleSelect={() =>
                        state.toggleCanvasSelection(
                          createIncomingColumnSelection(),
                        )
                      }
                    >
                      <div className="min-h-full bg-white p-4">
                        <div className="sticky top-0 z-30 mb-4 border-b border-slate-200 bg-white/95 pb-3">
                          <div className="flex bg-white">
                            <button
                              onClick={() => state.setViewMode("ECHOES")}
                              className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${state.viewMode === "ECHOES" ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
                            >
                              Inbox ({state.unsavedEchoes.length || 0})
                            </button>
                            <button
                              onClick={() => state.setViewMode("RECS")}
                              className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-all ${state.viewMode === "RECS" ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
                            >
                              Recs ({recommendations?.length || 0})
                            </button>
                          </div>
                        </div>

                        {loading ? (
                          <div className="flex flex-col items-center justify-center py-16 opacity-70">
                            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-[10px] font-bold font-mono text-muted uppercase tracking-widest">
                              Resonating...
                            </p>
                          </div>
                        ) : state.viewMode === "ECHOES" ? (
                          <div className="relative">
                            <div className="absolute left-[11px] top-2 bottom-0 w-[1px] bg-slate-200 z-0"></div>
                            {state.unsavedEchoes.length === 0 && !loading && (
                              <p className="text-xs text-center text-muted italic mt-6">
                                No new incoming echoes.
                              </p>
                            )}
                            <div className="space-y-6 relative z-10">
                              {state.unsavedEchoes.map(
                                (bookGroup: any, index: number) => {
                                  const stackId = `stack-${bookGroup.id || index}`;
                                  const isExpanded =
                                    state.expandedStackId === stackId;
                                  const stackCount =
                                    bookGroup.chunks?.length || 0;

                                  return (
                                    <div
                                      key={stackId}
                                      className="relative pl-8"
                                    >
                                      <div
                                        className={`absolute left-[7px] top-5 w-2.5 h-2.5 rounded-full border-2 transition-colors z-20 ${isExpanded ? "border-blue-500 bg-blue-500" : "border-slate-400 bg-surface"}`}
                                      ></div>
                                      {!isExpanded ? (
                                        <div
                                          onClick={() =>
                                            state.toggleStack(stackId)
                                          }
                                          className="relative cursor-pointer group mt-2"
                                        >
                                          {/* --- LAYER 1 (First Card Behind) --- */}
                                          {stackCount > 1 && (
                                            <div className="absolute inset-0 bg-surface border border-slate-300 rounded-sm shadow-sm z-0 translate-x-1.5 -translate-y-1.5"></div>
                                          )}

                                          {/* --- LAYER 2 (Second Card Behind) --- */}
                                          {stackCount > 2 && (
                                            <div className="absolute inset-0 bg-surface border border-slate-300 rounded-sm shadow-sm z-[-1] translate-x-3 -translate-y-3"></div>
                                          )}
                                          <div className="relative z-10 border border-slate-200 bg-white p-4 shadow-sm transition-all group-hover:border-slate-300">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                              <h4 className="truncate pr-4 text-sm font-semibold tracking-[-0.02em] text-slate-900">
                                                {bookGroup.title}
                                              </h4>
                                              <span className="text-[10px] font-bold text-slate-500">
                                                {stackCount} Nodes
                                              </span>
                                            </div>
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                              Open source stack
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="overflow-hidden border border-slate-200 bg-white shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
                                          <div
                                            onClick={() =>
                                              state.toggleStack(stackId)
                                            }
                                            className="flex cursor-pointer items-center justify-between border-b border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                                          >
                                            <div className="overflow-hidden pr-4">
                                              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                                <IonIcon icon={linkOutline} className="h-3 w-3" />
                                                Incoming echoes from
                                              </span>
                                              <h4 className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-900">
                                                {bookGroup.title}
                                              </h4>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-slate-900">
                                              Close
                                            </span>
                                          </div>
                                          <div className="space-y-4 bg-white p-4">
                                            {bookGroup.chunks?.map(
                                              (
                                                chunk: EchoChunk,
                                                chunkIndex: number,
                                              ) => (
                                                <InteractiveChunkCard
                                                  key={chunkIndex}
                                                  chunk={chunk}
                                                  chunkIndex={chunkIndex}
                                                  query={query || ""}
                                                  libraryId={libraryId}
                                                  activeBookTitle={
                                                    activeBookTitle
                                                  }
                                                  bookId={activeBookTitle}
                                                  onNoteClick={
                                                    handleCreateNoteFromEcho
                                                  }
                                                  onManageNotes={(echoId) =>
                                                    state.setViewingEchoNotes({
                                                      echoId,
                                                    })
                                                  }
                                                  onSaveSuccess={
                                                    state.refreshGlobalCanvas
                                                  }
                                                  onEchoSaved={
                                                    state.handleEchoSaved
                                                  }
                                                  linkedNoteIds={
                                                    state.localLinkedNotes[
                                                      (chunk as any).echo_id ||
                                                        (chunk as any).chunk_id
                                                    ] || []
                                                  }
                                                  onCreateBranchFromHighlight={
                                                    createIncomingHighlightBranch
                                                  }
                                                  onAskRagFromHighlight={
                                                    state.openHighlightRagComposer
                                                  }
                                                  onOpenReader={() =>
                                                    openIncomingWorkspace(
                                                      bookGroup,
                                                      chunk,
                                                    )
                                                  }
                                                  selectionMode={
                                                    state.selectionMode
                                                  }
                                                  isSelected={state.isCanvasItemSelected(
                                                    createIncomingEchoSelection(
                                                      bookGroup,
                                                      chunk,
                                                      chunkIndex,
                                                    ).key,
                                                  )}
                                                  onToggleSelect={() =>
                                                    state.toggleCanvasSelection(
                                                      createIncomingEchoSelection(
                                                        bookGroup,
                                                        chunk,
                                                        chunkIndex,
                                                      ),
                                                    )
                                                  }
                                                  sourceAnchorId={
                                                    state.activeColumnId
                                                  }
                                                />
                                              ),
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4 relative z-10">
                            {recommendations.length === 0 && !loading && (
                              <p className="text-xs text-center text-muted italic mt-6">
                                No recommendations found.
                              </p>
                            )}
                            {recommendations.map(
                              (rec: EchoRecommendation, index: number) => (
                                <div
                                  key={index}
                                  className="bg-surface border border-border-subtle rounded-sm p-4 shadow-sm hover:border-slate-300 transition-all"
                                >
                                  <h4 className="font-bold text-primary text-sm mb-1">
                                    {rec.title}
                                  </h4>
                                  <p className="text-[9px] font-mono text-muted uppercase mb-3">
                                    {rec.author || "Unknown Author"}
                                  </p>
                                  <div className="bg-canvas p-3 rounded-sm border border-slate-100">
                                    <p className="text-xs text-slate-600 leading-relaxed italic border-l-2 border-slate-300 pl-2">
                                      "{rec.description}"
                                    </p>
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </DraggableColumn>
                  )}

                  {visibleDraftBranchColumns.map((draft: any) => (
                    <DraftBranchColumn
                      key={draft.id}
                      draft={draft}
                      initialPos={
                        state.positions[draft.id] || { x: 1320, y: 100 }
                      }
                      zIndex={state.zIndexes[draft.id] || 1}
                      updatePosition={state.updatePosition}
                      bringToFront={state.bringToFront}
                      canvasScale={canvasScale}
                      setPendingEchoForNote={handleCreateNoteFromEcho}
                      setViewingEchoNotes={state.setViewingEchoNotes}
                      refreshGlobalCanvas={state.refreshGlobalCanvas}
                      localLinkedNotes={state.localLinkedNotes}
                      setIsCanvasWheelDisabled={state.setIsCanvasWheelDisabled}
                      interactionReduced={isInteracting}
                      ensureDraftBranchCluster={state.ensureDraftBranchCluster}
                      handleDraftBranchSaved={state.handleDraftBranchSaved}
                      closeDraftBranch={state.closeDraftBranch}
                      onCreateBranchFromHighlight={
                        state.createDraftBranchFromHighlight
                      }
                      onAskRagFromHighlight={state.openHighlightRagComposer}
                      onClearHighlightRagComposer={
                        state.clearHighlightRagComposer
                      }
                      isHighlighted={state.highlightedBranchClusterIds?.has?.(
                        String(draft.id),
                      )}
                      selectionMode={state.selectionMode}
                      isColumnSelected={state.isCanvasItemSelected(
                        `draft-column:${draft.id}`,
                      )}
                      onToggleColumnSelect={() =>
                        state.toggleCanvasSelection(
                          createDraftColumnSelection(draft),
                        )
                      }
                      isEchoSelected={(key: string) =>
                        state.isCanvasItemSelected(`draft-echo:${key}`)
                      }
                      onToggleEchoSelect={(
                        chunk: any,
                        group: any,
                        chunkIndex: number,
                      ) =>
                        state.toggleCanvasSelection(
                          createDraftEchoSelection(
                            draft,
                            group,
                            chunk,
                            chunkIndex,
                          ),
                        )
                      }
                    />
                  ))}

                  {visibleDerivedColumns.map((derived: any) => (
                    <DerivedAnalysisColumn
                      key={derived.id}
                      derived={derived}
                      initialPos={
                        state.positions[derived.id] || { x: 1480, y: 120 }
                      }
                      zIndex={state.zIndexes[derived.id] || 1}
                      updatePosition={state.updatePosition}
                      bringToFront={state.bringToFront}
                      canvasScale={canvasScale}
                      setIsCanvasWheelDisabled={state.setIsCanvasWheelDisabled}
                      interactionReduced={isInteracting}
                      closeDerivedColumn={state.closeDerivedColumn}
                      saveDerivedColumn={state.saveDerivedColumn}
                      selectionMode={state.selectionMode}
                      isSelected={state.isCanvasItemSelected(
                        `derived-column:${derived.id}`,
                      )}
                      onCreateBranchFromHighlight={createDerivedHighlightBranch}
                      onAskRagFromHighlight={state.openHighlightRagComposer}
                      onClearHighlightRagComposer={
                        state.clearHighlightRagComposer
                      }
                      onToggleSelect={() =>
                        state.toggleCanvasSelection(
                          createDerivedColumnSelection(derived),
                        )
                      }
                    />
                  ))}

                  {visibleEchoClusters.map((cluster: any) => (
                    <SavedClusterColumn
                      key={cluster.id}
                      cluster={cluster}
                      updatePosition={state.updatePosition}
                      initialPos={
                        state.positions[cluster.id] || { x: 1000, y: 100 }
                      }
                      zIndex={state.zIndexes[cluster.id] || 1}
                      bringToFront={state.bringToFront}
                      canvasScale={canvasScale}
                      handleToggleActive={state.handleToggleActive}
                      handleSpawnCluster={state.handleSpawnCluster}
                      setViewingEchoNotes={state.setViewingEchoNotes}
                      refreshGlobalCanvas={state.refreshGlobalCanvas}
                      localLinkedNotes={state.localLinkedNotes}
                      setIsCanvasWheelDisabled={state.setIsCanvasWheelDisabled}
                      handleRenameCluster={state.handleRenameCluster}
                      handleDeleteCluster={state.handleDeleteCluster}
                      interactionReduced={isInteracting}
                      expandedEchoId={
                        state.expandedEchoByCluster?.[cluster.id] || null
                      }
                      onToggleEchoExpand={state.toggleSavedEchoExpansion}
                      branchCountByEchoId={branchCountByEchoId}
                      onCreateBranchFromHighlight={
                        state.createDraftBranchFromHighlight
                      }
                      onAskRagFromHighlight={state.openHighlightRagComposer}
                      onMaximize={(clusterId: string) =>
                        state.openClusterReader(clusterId)
                      }
                      onOpenEchoReader={(payload: any) =>
                        state.openClusterReader(
                          payload.clusterId,
                          payload.echoId,
                        )
                      }
                      onShowBranches={state.focusBranchesForEcho}
                      isHighlighted={state.highlightedBranchClusterIds?.has?.(
                        String(cluster.id),
                      )}
                      selectionMode={state.selectionMode}
                      isColumnSelected={state.isCanvasItemSelected(
                        `saved-column:${cluster.id}`,
                      )}
                      onToggleColumnSelect={() =>
                        state.toggleCanvasSelection(
                          createSavedClusterSelection(cluster),
                        )
                      }
                      isEchoSelected={(echoId: string) =>
                        state.isCanvasItemSelected(
                          `saved-echo:${cluster.id}:${echoId}`,
                        )
                      }
                      onToggleEchoSelect={(chunk: any) =>
                        state.toggleCanvasSelection(
                          createSavedEchoSelection(cluster, chunk),
                        )
                      }
                    />
                  ))}
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      <div className="absolute bottom-4 right-4 z-[2200] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:bottom-6 sm:right-6">
        <div className="flex flex-wrap items-stretch justify-end gap-2">
          {state.activeRagComposer.visible && (
            <div
              data-selection-ignore="true"
              data-marker-persist="true"
              className="flex min-w-[320px] max-w-3xl flex-1 items-center gap-3 border border-slate-200 bg-white px-4 py-3 shadow-lg"
            >
              <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {state.activeRagComposer.scopeLabel || "Selected Context"}
              </div>
              <input
                data-selection-ignore="true"
                ref={ragInputRef}
                value={state.ragComposerState.prompt}
                onChange={(e) => state.setRagComposerPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    state.submitRagComposer();
                  }
                }}
                placeholder="Ask a question about this marked or selected context"
                className="min-w-[180px] flex-1 border-none bg-transparent px-0 py-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                data-selection-ignore="true"
                onClick={state.closeRagComposer}
                className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-900"
              >
                Clear
              </button>
              <button
                data-selection-ignore="true"
                onClick={state.submitRagComposer}
                className="inline-flex items-center gap-2 bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-black"
              >
                <IonIcon icon={chatbubbleEllipsesOutline} className="h-4 w-4" />
                Run RAG
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 border border-slate-200 bg-white/95 px-3 py-2 shadow-lg">
            <button
              onClick={() => {
                setIsAnalyzeMenuOpen(false);
                state.toggleSelectionMode();
              }}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                state.selectionMode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {state.selectionMode
                ? `Select ${state.selectedItems.length || 0}`
                : "Select"}
            </button>

            <div className="relative">
              <button
                onClick={() => setIsAnalyzeMenuOpen((prev) => !prev)}
                disabled={!state.activeAnalysisSelection.contexts.length}
                className="inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-40"
              >
                <IonIcon icon={sparklesOutline} className="h-4 w-4" />
                Analyze
              </button>
              {isAnalyzeMenuOpen && (
                <div className="absolute bottom-12 right-0 z-[2300] min-w-[220px] border border-slate-200 bg-white p-1 shadow-lg">
                  {[
                    {
                      id: "cross_pollination",
                      label: "Cross-Pollination",
                    },
                    {
                      id: "friction",
                      label: "Friction Analysis",
                    },
                    {
                      id: "gap",
                      label: "Gap Analysis",
                    },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setIsAnalyzeMenuOpen(false);
                        state.runSelectionAnalysis(mode.id);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <span>{mode.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setIsAnalyzeMenuOpen(false);
                if (!state.activeRagComposer.visible) {
                  state.openSelectionRagComposer();
                  return;
                }
                ragInputRef.current?.focus();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-900"
            >
              <IonIcon icon={chatbubbleEllipsesOutline} className="h-4 w-4" />
              Ask RAG
            </button>

            {(state.selectionMode && state.selectedItems.length > 0) ||
            state.activeAnalysisSelection.sourceType === "highlight" ? (
              <button
                onClick={() => {
                  state.clearSelections();
                  state.closeRagComposer();
                }}
                className="inline-flex items-center gap-1 px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-900"
              >
                <IonIcon icon={closeOutline} className="h-4 w-4" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {state.echoNoteState.isOpen && (
        <NotesFormUI
          groupId={state.echoNoteState.groupId || ""}
          initialNote={state.echoNoteState.initialNote}
          prefillContent={state.echoNoteState.prefill}
          prefillTitle={state.echoNoteState.prefillTitle}
          stacks={state.stacks || []}
          groups={state.groups || []}
          onClose={() =>
            state.setEchoNoteState({
              isOpen: false,
              groupId: null,
              prefill: "",
              prefillTitle: "",
              echoId: null,
              initialNote: undefined,
            })
          }
          onSave={async (
            title: string,
            content: string,
            tags: string,
            noteId: string,
            targetGroupId: string,
          ) => {
            if (noteId) {
              await state.updateNote(
                noteId,
                targetGroupId,
                title,
                content,
                tags,
              );
            } else {
              const newNoteId = await state.createNote(
                targetGroupId,
                title,
                content,
                tags,
                state.echoNoteState.echoId || null,
              );
              if (newNoteId && state.echoNoteState.echoId) {
                await axios.post(buildApiUrl("/brain/echo/link_note"), {
                  echo_id: state.echoNoteState.echoId,
                  note_id: newNoteId,
                });
              }
            }
            await state.refreshGlobalCanvas();
            publish([
              "canvas.snapshot",
              "mindmap.graph",
              `notes.group:${targetGroupId}`,
            ]);
            state.setEchoNoteState({
              isOpen: false,
              groupId: null,
              prefill: "",
              prefillTitle: "",
              echoId: null,
              initialNote: undefined,
            });
          }}
        />
      )}

      {state.viewingEchoNotes && (
        <FloatingNoteModal
          echoId={state.viewingEchoNotes.echoId}
          onClose={() => state.setViewingEchoNotes(null)}
          onAdd={(echoData) => {
            state.setViewingEchoNotes(null);
            handleCreateNoteFromEcho(echoData);
          }}
          onEdit={(note) => {
            state.setViewingEchoNotes(null);
            state.setEchoNoteState({
              isOpen: true,
              groupId: note.group_id,
              prefill: "",
              prefillTitle: "",
              echoId: null,
              initialNote: note,
            });
          }}
        />
      )}
      {state.maximizedReaderState && (
        <MaximizedColumnView
          cluster={
            state.maximizedReaderState?.clusterId
              ? echoClusters.find(
                  (c: any) =>
                    String(c.id) ===
                    String(state.maximizedReaderState?.clusterId || ""),
                )
              : null
          }
          allClusters={state.savedGlobalClusters}
          initialEchoId={state.maximizedReaderState?.initialEchoId || ""}
          adHocItems={state.maximizedReaderState?.items || []}
          adHocTitle={state.maximizedReaderState?.title || ""}
          adHocSubtitle={state.maximizedReaderState?.subtitle || ""}
          onClose={state.closeMaximizedReader}
          libraryId={libraryId}
          activeBookTitle={activeBookTitle}
          onRefreshSaved={state.refreshGlobalCanvas}
        />
      )}
    </>
  );
}
