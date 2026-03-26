import React from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";

import NotesFormUI from "./notesFormUI";
import AutoZoomTrigger from "./components/AutoZoomTrigger";
import NoteStackColumn from "./components/NoteStackColumn";
import useNotesSectionState from "./hooks/useNotesSectionState";
import axios from "axios";
import { useRefreshBus } from "../../system/RefreshBusProvider";
import { buildApiUrl } from "../../../lib/runtimeConfig";
import useCanvasViewport from "../../../hooks/appTools/useCanvasViewport";
import useCanvasInteractionMode from "../../../hooks/appTools/useCanvasInteractionMode";

const NOTE_STACK_WIDTH = 650;
const NOTE_STACK_HEIGHT = 2600;

const NotesSectionUI: React.FC = () => {
  const state = useNotesSectionState();
  const { publish } = useRefreshBus();
  const { isInteracting, startInteraction, settleInteraction } =
    useCanvasInteractionMode(140);
  const { canvasScale, syncViewport, isRectVisible } = useCanvasViewport({
    initialScale: 1,
    initialPositionX: 0,
    initialPositionY: 0,
    buffer: 1800,
  });
  const visibleStacks = React.useMemo(
    () =>
      (state.stacks || []).filter((stack) => {
        const position = state.positions[stack.stack_id] || {
          x: 100,
          y: 150,
        };
        return isRectVisible({
          x: position.x,
          y: position.y,
          width: NOTE_STACK_WIDTH,
          height: NOTE_STACK_HEIGHT,
        });
      }),
    [isRectVisible, state.positions, state.stacks],
  );
  const groupsByStackId = React.useMemo(() => {
    const grouped = new Map<string, any[]>();
    (state.groups || []).forEach((group) => {
      const key = String(group.stack_id || "");
      const existing = grouped.get(key);
      if (existing) {
        existing.push(group);
        return;
      }
      grouped.set(key, [group]);
    });
    return grouped;
  }, [state.groups]);
  const handleViewportUpdate = React.useCallback(
    (ref: any) => {
      syncViewport(ref);
      state.setCanvasScale(ref?.state?.scale || 1);
    },
    [state.setCanvasScale, syncViewport],
  );

  return (
    <div className="relative w-full h-full bg-[#f8f9fa] overflow-hidden font-sans border border-border-subtle shadow-sm rounded-lg">
      <TransformWrapper
          initialScale={1}
          initialPositionX={0}
          initialPositionY={0}
          minScale={0.1}
          maxScale={3}
          limitToBounds={false}
          centerZoomedOut={false}
          wheel={{ step: 0.1, smoothStep: 0.0005 }}
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
            <React.Fragment>
              <AutoZoomTrigger
                targetId={state.zoomTarget}
                zoomToElement={zoomToElement}
                onZoomed={() => state.setZoomTarget(null)}
              />
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
              >
                <div
                  className={`relative w-0 h-0 ${
                    isInteracting ? "canvas-interaction-reduced" : ""
                  }`}
                >
                  <div
                    className="absolute pointer-events-none opacity-40"
                    style={{
                      left: -5000,
                      top: -5000,
                      width: "10000px",
                      height: "10000px",
                      backgroundImage:
                        "radial-gradient(#d1d5db 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  />
                  <div
                    id="canvas-container"
                    className="absolute left-0 top-0 z-10 w-0 h-0"
                  >
                    {!state.stacks || state.stacks.length === 0 ? (
                      <div className="absolute top-[200px] left-[100px] text-muted font-mono text-sm bg-surface/80 px-6 py-2 rounded-lg border border-gray-300 shadow-sm   whitespace-nowrap">
                        [ NO STACKS FOUND. CREATE ONE TO START YOUR WORKSPACE. ]
                      </div>
                    ) : (
                      visibleStacks.map((stack) => (
                        <NoteStackColumn
                          key={stack.stack_id}
                          stack={stack}
                          groups={
                            groupsByStackId.get(String(stack.stack_id)) || []
                          }
                          activeGroupId={state.activeGroupId}
                          currentNotes={state.currentNotes}
                          initialPos={
                            state.positions[stack.stack_id] || {
                              x: 100,
                              y: 150,
                            }
                          }
                          zIndex={state.zIndexes[stack.stack_id] || 10}
                          scale={canvasScale}
                          bringToFront={state.bringToFront}
                          onDragEnd={state.updatePosition}
                          onCreateGroup={state.createGroup}
                          onDeleteStack={state.handleDeleteStack}
                          onOpenGroup={state.handleOpenGroup}
                          onInitiateCreateNote={state.handleInitiateCreateNote}
                          onOpenNote={state.handleOpenNote}
                          onDeleteGroup={state.handleDeleteGroup}
                          onDeleteNote={state.handleDeleteNote}
                          onRenameStack={state.renameStack}
                          onRenameGroup={state.renameGroup}
                          isHighlighted={state.highlightId === stack.stack_id}
                          highlightedGroupId={state.highlightId}
                          interactionReduced={isInteracting}
                        />
                      ))
                    )}
                  </div>
                </div>
              </TransformComponent>
              <div className="absolute bottom-3 left-3 z-[100] flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface/95 p-1.5 shadow-sm pointer-events-auto sm:bottom-6 sm:left-6">
                <button
                  onClick={() => zoomIn(0.2)}
                  className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-md transition-colors"
                >
                  <MagnifyingGlassPlusIcon className="w-5 h-5" />
                </button>
                <div className="text-[10px] font-mono font-bold text-center text-muted py-1 border-y border-gray-100 w-full">
                  {Math.round(canvasScale * 100)}%
                </div>
                <button
                  onClick={() => zoomOut(0.2)}
                  className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-md transition-colors"
                >
                  <MagnifyingGlassMinusIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => zoomToElement("canvas-container", 1, 600)}
                  className="p-2 text-gray-600 hover:text-primary hover:bg-gray-100 rounded-md transition-colors mt-1 border-t border-gray-100 flex flex-col items-center justify-center"
                >
                  <ViewfinderCircleIcon className="w-5 h-5" />
                </button>
              </div>
            </React.Fragment>
          )}
        </TransformWrapper>

      <div className="absolute right-3 top-16 z-[2000] pointer-events-auto flex gap-4 items-start sm:top-6 sm:right-6">
        {state.isCreatingStack ? (
          <div className="bg-surface/95   p-4 rounded-lg shadow-xl border border-gray-400 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Stack Name..."
              value={state.draftStackTitle}
              onChange={(e) => state.setDraftStackTitle(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && state.createStack(state.draftStackTitle)
              }
              className="p-2 border border-gray-300 rounded focus:outline-none focus:border-gray-900 text-sm font-bold"
            />
            <div className="flex justify-end gap-2 mt-1">
              <button
                onClick={() => state.setIsCreatingStack(false)}
                className="text-xs font-bold text-muted hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  state.createStack(state.draftStackTitle);
                  state.setIsCreatingStack(false);
                  state.setDraftStackTitle("");
                }}
                className="text-xs font-bold bg-accent text-accent-text px-3 py-1 rounded hover:bg-accent-hover"
              >
                Save Stack
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => state.setIsCreatingStack(true)}
            className="px-4 py-2 bg-accent text-accent-text text-sm font-bold rounded shadow-lg hover:bg-accent-hover transition border border-gray-700"
          >
            + New Stack
          </button>
        )}
      </div>

      {state.formState.isOpen && state.formState.groupId && (
        <NotesFormUI
          groupId={state.formState.groupId}
          initialNote={state.formState.note}
          stacks={state.stacks} // <--- ADD THIS
          groups={state.groups} // <--- ADD THIS
          onClose={() =>
            state.setFormState({
              isOpen: false,
              groupId: null,
              note: null,
            })
          }
          onSave={async (
            title: string,
            content: string,
            tags: string,
            noteId: string,
            newGroupId?: string,
          ) => {
            const previousGroupId = state.formState.groupId;
            const targetGroupId = newGroupId || state.formState.groupId!;

            if (noteId) {
              // THE FIX: Bypass the hook and force the exact payload to the API
              await axios.put(buildApiUrl("/notes/item/update"), {
                note_id: noteId,
                title: title,
                content: content,
                tags: tags,
                group_id: targetGroupId,
              });

              await state.fetchNotesForGroup(targetGroupId);
              if (state.activeGroupId !== targetGroupId) {
                state.setActiveGroupId(targetGroupId);
              }
            } else {
              await state.createNote(targetGroupId, title, content, tags);
              await state.fetchNotesForGroup(targetGroupId);
            }

            publish(
              [
                "canvas.snapshot",
                "mindmap.graph",
                `notes.group:${targetGroupId}`,
                previousGroupId && previousGroupId !== targetGroupId
                  ? `notes.group:${previousGroupId}`
                  : "",
              ].filter(Boolean) as string[],
            );

            state.setFormState({
              isOpen: false,
              groupId: null,
              note: null,
            });
          }}
        />
      )}
    </div>
  );
};

export default NotesSectionUI;
