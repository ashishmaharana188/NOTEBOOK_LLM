import React from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import axios from "axios";
import {
  BookOpenIcon,
  LinkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ViewfinderCircleIcon,
  XMarkIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

import type { EchoChunk, EchoRecommendation } from "./echoTypes";
import NotesFormUI from "../noteModule/notesFormUI";
import AutoZoomTrigger from "./components/AutoZoomTrigger";
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

const ECHO_COLUMN_WIDTH = 420;
const ECHO_COLUMN_HEIGHT = 750;

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
      (state.savedGlobalClusters || []).filter((cluster: any) => {
        const isNoteStack = state.stacks?.some(
          (stack: any) => String(stack.stack_id) === String(cluster.id),
        );
        return !isNoteStack;
      }),
    [state.savedGlobalClusters, state.stacks],
  );
  const activeColumnPos = state.positions[state.activeColumnId] || {
    x: 0,
    y: 0,
  };
  const activeColumnVisible = isRectVisible({
    x: activeColumnPos.x,
    y: activeColumnPos.y,
    width: ECHO_COLUMN_WIDTH,
    height: ECHO_COLUMN_HEIGHT,
  });
  const visibleEchoClusters = React.useMemo(
    () =>
      echoClusters.filter((cluster: any) => {
        const position = state.positions[cluster.id] || {
          x: 1000,
          y: 100,
        };
        return isRectVisible({
          x: position.x,
          y: position.y,
          width: ECHO_COLUMN_WIDTH,
          height: ECHO_COLUMN_HEIGHT,
        });
      }),
    [echoClusters, isRectVisible, state.positions],
  );
  const visibleEchoClusterIds = React.useMemo(
    () =>
      new Set(visibleEchoClusters.map((cluster: any) => String(cluster.id))),
    [visibleEchoClusters],
  );
  const visibleEchoEdges = React.useMemo(
    () =>
      echoClusters.filter((cluster: any) => {
        if (!cluster.parent_cluster_id) return false;
        const start = state.positions[cluster.parent_cluster_id];
        const end = state.positions[cluster.id];
        if (!start || !end) return false;
        if (
          visibleEchoClusterIds.has(String(cluster.id)) ||
          visibleEchoClusterIds.has(String(cluster.parent_cluster_id))
        ) {
          return true;
        }
        const edgeLeft = Math.min(start.x + ECHO_COLUMN_WIDTH, end.x);
        const edgeTop = Math.min(start.y, end.y);
        return isRectVisible({
          x: edgeLeft,
          y: edgeTop,
          width: Math.abs(end.x - (start.x + ECHO_COLUMN_WIDTH)) || 1,
          height: Math.abs(end.y - start.y) + 160,
        });
      }),
    [echoClusters, isRectVisible, state.positions, visibleEchoClusterIds],
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
                          "radial-gradient(#cbd5e1 1.5px, transparent 1.5px)",
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
                        width: 500,
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
                          const start = state.positions[c.parent_cluster_id];
                          const end = state.positions[c.id];
                          if (!start || !end) return null;
                          const startX = start.x + 400;
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
                        author="Incoming Signal"
                        initialPos={
                          state.positions[state.activeColumnId] || {
                            x: 550,
                            y: 100,
                          }
                        }
                        onDragEnd={state.updatePosition}
                        zIndex={state.zIndexes[state.activeColumnId] || 1}
                        bringToFront={state.bringToFront}
                        scale={canvasScale}
                        interactionReduced={isInteracting}
                      >
                        <div className="p-4 bg-canvas/50 min-h-full">
                          <div className="sticky top-0 bg-canvas/95 z-30 pb-3 border-b border-border-subtle mb-4">
                            <div className="flex bg-slate-200 p-0.5 rounded-sm">
                              <button
                                onClick={() => state.setViewMode("ECHOES")}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all ${state.viewMode === "ECHOES" ? "bg-surface shadow-sm text-primary" : "text-muted hover:text-primary"}`}
                              >
                                Inbox ({state.unsavedEchoes.length || 0})
                              </button>
                              <button
                                onClick={() => state.setViewMode("RECS")}
                                className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all ${state.viewMode === "RECS" ? "bg-surface shadow-sm text-primary" : "text-muted hover:text-primary"}`}
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
                                            <div className="relative z-10 bg-surface border border-border-subtle group-hover:border-slate-400 rounded-sm shadow-sm p-4 transition-all">
                                              <div className="flex justify-between items-center mb-1">
                                                <span className="text-[9px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                                  <LinkIcon className="w-3 h-3" />{" "}
                                                  Connects To
                                                </span>
                                                <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">
                                                  {stackCount} Nodes
                                                </span>
                                              </div>
                                              <h4 className="font-bold text-primary text-sm truncate">
                                                {bookGroup.title}
                                              </h4>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="bg-surface border border-slate-300 rounded-sm shadow-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div
                                              onClick={() =>
                                                state.toggleStack(stackId)
                                              }
                                              className="bg-canvas border-b border-border-subtle p-4 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                                            >
                                              <div className="overflow-hidden pr-4">
                                                <span className="text-[9px] font-bold text-muted uppercase tracking-widest flex items-center gap-1 mb-1">
                                                  <LinkIcon className="w-3 h-3" />{" "}
                                                  Connections With
                                                </span>
                                                <h4 className="font-bold text-primary text-sm truncate">
                                                  {bookGroup.title}
                                                </h4>
                                              </div>
                                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted hover:text-primary transition-colors">
                                                Close
                                              </span>
                                            </div>
                                            <div className="p-4 space-y-4 bg-canvas/50">
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
                                                    linkedNoteIds={
                                                      state.localLinkedNotes[
                                                        (chunk as any)
                                                          .echo_id ||
                                                          (chunk as any)
                                                            .chunk_id
                                                      ] || []
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

                    {visibleEchoClusters.map((cluster: any) => (
                      <SavedClusterColumn
                        key={cluster.id}
                        cluster={cluster}
                        positions={state.positions}
                        updatePosition={state.updatePosition}
                        initialPos={
                          state.positions[cluster.id] || { x: 1000, y: 100 }
                        }
                        zIndex={state.zIndexes[cluster.id] || 1}
                        bringToFront={state.bringToFront}
                        canvasScale={canvasScale}
                        handleToggleActive={state.handleToggleActive}
                        handleSpawnCluster={state.handleSpawnCluster}
                        setPendingEchoForNote={handleCreateNoteFromEcho}
                        setViewingEchoNotes={state.setViewingEchoNotes}
                        refreshGlobalCanvas={state.refreshGlobalCanvas}
                        localLinkedNotes={state.localLinkedNotes}
                        setIsCanvasWheelDisabled={
                          state.setIsCanvasWheelDisabled
                        }
                        handleRenameCluster={state.handleRenameCluster}
                        handleDeleteCluster={state.handleDeleteCluster}
                        interactionReduced={isInteracting}
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
