import React from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import axios from "axios";
import {
  LinkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";

import type { EchoChunk, EchoRecommendation } from "./echoTypes";
import NotesFormUI from "../noteModule/notesFormUI";
import AutoZoomTrigger from "./components/AutoZoomTrigger";
import DraftBranchColumn from "./components/DraftBranchColumn";
import DraggableColumn from "./components/DraggableColumn";
import InteractiveChunkCard from "./components/InteractiveChunkCard";
import MaximizedColumnView from "./components/MaximizedColumnView";
import SavedClusterColumn from "./components/SavedClusterColumn";
import FloatingNoteModal from "./modals/FloatingNoteModal";
import useEchoDashboardState from "./hooks/useEchoDashboardState";
import { useRefreshBus } from "../../system/RefreshBusProvider";
import { buildApiUrl } from "../../../lib/runtimeConfig";
import useCanvasViewport from "../../../hooks/appTools/useCanvasViewport";
import useCanvasInteractionMode from "../../../hooks/appTools/useCanvasInteractionMode";

const INCOMING_COLUMN_WIDTH = 560;
const SAVED_COLUMN_WIDTH = 470;
const DRAFT_COLUMN_WIDTH = 560;
const ECHO_COLUMN_HEIGHT = 780;

export default function EchoDashboardUI(props: any) {
  const { publish } = useRefreshBus();
  const { isInteracting, startInteraction, settleInteraction } =
    useCanvasInteractionMode(140);
  const state = useEchoDashboardState(props);
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
  const visibleEchoClusterIds = React.useMemo(
    () =>
      new Set([
        ...visibleEchoClusters.map((cluster: any) => String(cluster.id)),
        ...visibleDraftBranchColumns.map((draft: any) => String(draft.id)),
      ]),
    [visibleDraftBranchColumns, visibleEchoClusters],
  );
  const visibleEchoEdges = React.useMemo(
    () => {
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
    },
    [
      draftBranches,
      echoClusters,
      isRectVisible,
      state.positions,
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
      });
    },
    [
      activeBookTitle,
      libraryId,
      state.createDraftBranchFromHighlight,
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
                    <MagnifyingGlassPlusIcon className="w-4 h-4" />
                  </button>
                  <div className="text-[9px] font-mono font-bold text-center text-muted py-1 border-y border-slate-100 w-full">
                    {Math.round(canvasScale * 100)}%
                  </div>
                  <button
                    onClick={() => zoomOut(0.2)}
                    className="p-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-sm transition-colors"
                  >
                    <MagnifyingGlassMinusIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => zoomToElement("cards-bounding-box", 1, 600)}
                    className="p-2 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-sm transition-colors mt-1 border-t border-slate-100 flex flex-col items-center justify-center"
                  >
                    <ViewfinderCircleIcon className="w-4 h-4" />
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
                        {visibleEchoEdges.map((c) => {
                          const start = state.positions[c.parentId];
                          const end = state.positions[c.id];
                          if (!start || !end) return null;
                          const startX = start.x + SAVED_COLUMN_WIDTH;
                          const startY = start.y + 80;
                          const endX = end.x;
                          const endY = end.y + 80;
                          const cpOffset = Math.max(
                            150,
                            Math.abs(endX - startX) * 0.45,
                          );
                          return (
                            <path
                              key={`edge-${c.id}`}
                              d={`M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX} ${endY}`}
                              stroke="#64748b"
                              strokeWidth="3.5"
                              fill="none"
                              opacity="0.8"
                              strokeDasharray="6 6"
                            />
                          );
                        })}
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
                                                  <LinkIcon className="h-3 w-3" />
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
                                                      state.setViewingEchoNotes(
                                                        {
                                                          echoId,
                                                        },
                                                      )
                                                    }
                                                    onSaveSuccess={
                                                      state.refreshGlobalCanvas
                                                    }
                                                    onEchoSaved={
                                                      state.handleEchoSaved
                                                    }
                                                    linkedNoteIds={
                                                      state.localLinkedNotes[
                                                        (chunk as any)
                                                          .echo_id ||
                                                          (chunk as any)
                                                            .chunk_id
                                                      ] || []
                                                    }
                                                    onCreateBranchFromHighlight={
                                                      createIncomingHighlightBranch
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
                        initialPos={state.positions[draft.id] || { x: 1320, y: 100 }}
                        zIndex={state.zIndexes[draft.id] || 1}
                        updatePosition={state.updatePosition}
                        bringToFront={state.bringToFront}
                        canvasScale={canvasScale}
                        setPendingEchoForNote={handleCreateNoteFromEcho}
                        setViewingEchoNotes={state.setViewingEchoNotes}
                        refreshGlobalCanvas={state.refreshGlobalCanvas}
                        localLinkedNotes={state.localLinkedNotes}
                        setIsCanvasWheelDisabled={
                          state.setIsCanvasWheelDisabled
                        }
                        interactionReduced={isInteracting}
                        ensureDraftBranchCluster={state.ensureDraftBranchCluster}
                        handleDraftBranchSaved={state.handleDraftBranchSaved}
                        closeDraftBranch={state.closeDraftBranch}
                        onCreateBranchFromHighlight={
                          state.createDraftBranchFromHighlight
                        }
                        isHighlighted={state.highlightedBranchClusterIds?.has?.(
                          String(draft.id),
                        )}
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
                        setIsCanvasWheelDisabled={
                          state.setIsCanvasWheelDisabled
                        }
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
                        onShowBranches={state.focusBranchesForEcho}
                        isHighlighted={state.highlightedBranchClusterIds?.has?.(
                          String(cluster.id),
                        )}
                      />
                    ))}
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
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
      {state.maximizedClusterId && (
        <MaximizedColumnView
          cluster={echoClusters.find(
            (c: any) => c.id === state.maximizedClusterId,
          )}
          onClose={() => state.setMaximizedClusterId(null)}
          query={query}
          libraryId={libraryId}
          activeBookTitle={activeBookTitle}
          localLinkedNotes={state.localLinkedNotes}
          onNoteClick={handleCreateNoteFromEcho}
          onManageNotes={(echoId: string) =>
            state.setViewingEchoNotes({ echoId })
          }
          onSaveSuccess={state.refreshGlobalCanvas}
        />
      )}
    </>
  );
}
