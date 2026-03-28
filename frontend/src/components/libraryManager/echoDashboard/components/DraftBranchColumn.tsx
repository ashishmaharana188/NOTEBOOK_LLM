import React from "react";
import InteractiveChunkCard from "./InteractiveChunkCard";
import DraggableColumn from "./DraggableColumn";

export default function DraftBranchColumn({
    draft,
    initialPos,
    zIndex,
    updatePosition,
    bringToFront,
    canvasScale,
    setPendingEchoForNote,
    setViewingEchoNotes,
    refreshGlobalCanvas,
    localLinkedNotes,
    setIsCanvasWheelDisabled,
    interactionReduced,
    ensureDraftBranchCluster,
    handleDraftBranchSaved,
    closeDraftBranch,
    isHighlighted,
}: any) {
    const resultGroups = draft.resultGroups || [];
    const recommendations = draft.recommendations || [];
    const isLoading = Boolean(draft.isLoading);
    const errorMessage = String(draft.errorMessage || "");

    return (
        <DraggableColumn
            id={draft.id}
            title={draft.title || "Draft Branch"}
            author="Highlight Research"
            initialPos={initialPos}
            zIndex={zIndex}
            onDragEnd={updatePosition}
            bringToFront={bringToFront}
            scale={canvasScale}
            disableScroll={true}
            setIsCanvasWheelDisabled={setIsCanvasWheelDisabled}
            interactionReduced={interactionReduced}
            onDelete={() => closeDraftBranch(draft.id)}
            defaultWidth={560}
            defaultHeight={780}
            isHighlighted={isHighlighted}
        >
            <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-slate-200 bg-white px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Branch Search
                    </div>
                    <p className="mt-2 line-clamp-3 font-serif text-[15px] leading-7 text-slate-800">
                        {draft.query}
                    </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center gap-3 px-1 py-6 text-sm text-slate-500">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                            Searching echoes...
                        </div>
                    ) : errorMessage ? (
                        <div className="border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                            {errorMessage}
                        </div>
                    ) : resultGroups.length === 0 ? (
                        <div className="border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                            {recommendations.length > 0
                                ? "No direct echoes returned for this highlight."
                                : "No echo results returned for this highlight."}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {resultGroups.map((group: any, groupIndex: number) => (
                                <section key={`${draft.id}-${group.id || groupIndex}`}>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h4 className="truncate pr-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                            {group.title}
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-500">
                                            {group.chunks?.length || 0}
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {(group.chunks || []).map(
                                            (chunk: any, chunkIndex: number) => (
                                                <InteractiveChunkCard
                                                    key={`${draft.id}-${groupIndex}-${chunkIndex}`}
                                                    chunk={chunk}
                                                    chunkIndex={chunkIndex}
                                                    query={draft.query || ""}
                                                    activeBookTitle={group.title}
                                                    bookId={draft.bookId}
                                                    libraryId={draft.libraryId}
                                                    onNoteClick={(data) =>
                                                        setPendingEchoForNote(
                                                            data as any,
                                                        )
                                                    }
                                                    onManageNotes={(echoId) =>
                                                        setViewingEchoNotes({
                                                            echoId,
                                                        })
                                                    }
                                                    onSaveSuccess={
                                                        refreshGlobalCanvas
                                                    }
                                                    linkedNoteIds={
                                                        localLinkedNotes[
                                                            chunk.echo_id ||
                                                                chunk.chunk_id
                                                        ] || []
                                                    }
                                                    resolveTargetClusterId={() =>
                                                        ensureDraftBranchCluster(
                                                            draft.id,
                                                        )
                                                    }
                                                    onEchoSaved={({
                                                        clusterId,
                                                    }) =>
                                                        handleDraftBranchSaved(
                                                            draft.id,
                                                            clusterId,
                                                        )
                                                    }
                                                />
                                            ),
                                        )}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DraggableColumn>
    );
}
