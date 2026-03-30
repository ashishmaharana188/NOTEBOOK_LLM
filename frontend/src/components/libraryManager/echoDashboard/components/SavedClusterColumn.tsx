import React, { useMemo } from "react";
import { IonIcon } from "@ionic/react";
import { addOutline, checkmarkOutline } from "ionicons/icons";
import DraggableColumn from "./DraggableColumn";
import SavedEchoCard from "./SavedEchoCard";

const SavedClusterColumn = React.memo(
    ({
        cluster,
        initialPos,
        zIndex,
        updatePosition,
        bringToFront,
        canvasScale,
        handleToggleActive,
        handleSpawnCluster,
        setViewingEchoNotes,
        refreshGlobalCanvas,
        localLinkedNotes,
        setIsCanvasWheelDisabled,
        interactionReduced,
        handleRenameCluster,
        handleDeleteCluster,
        expandedEchoId,
        onToggleEchoExpand,
        branchCountByEchoId,
        onCreateBranchFromHighlight,
        onAskRagFromHighlight,
        onClearHighlightRagComposer,
        onShowBranches,
        isHighlighted,
        originContext,
        selectionMode,
        isColumnSelected,
        onToggleColumnSelect,
        isEchoSelected,
        onToggleEchoSelect,
    }: any) => {
        const chunks = cluster.chunks || [];

        const echoChunksOnly = useMemo(
            () => chunks.filter((c: any) => c.type !== "note" && !c.note_id),
            [chunks],
        );

        const orderedChunks = useMemo(
            () => [...echoChunksOnly].reverse(),
            [echoChunksOnly],
        );

        return (
            <DraggableColumn
                id={cluster.id}
                title={cluster.title}
                author={cluster.is_active ? "Active Workspace" : "Saved Echoes"}
                initialPos={initialPos}
                zIndex={zIndex}
                onDragEnd={updatePosition}
                bringToFront={bringToFront}
                scale={canvasScale}
                disableScroll={true}
                setIsCanvasWheelDisabled={setIsCanvasWheelDisabled}
                interactionReduced={interactionReduced}
                onRename={(newTitle: string) =>
                    handleRenameCluster(cluster.id, newTitle)
                }
                onDelete={() => handleDeleteCluster(cluster.id)}
                defaultWidth={470}
                defaultHeight={780}
                isHighlighted={isHighlighted}
                selectionMode={selectionMode}
                isSelected={isColumnSelected}
                onToggleSelect={onToggleColumnSelect}
            >
                <div className="flex h-full min-h-0 flex-col">
                    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                                onClick={() =>
                                    handleToggleActive(
                                        cluster.id,
                                        cluster.book_id,
                                        cluster.library_id,
                                    )
                                }
                                className={`inline-flex items-center gap-1 px-0 py-0 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ${
                                    cluster.is_active
                                        ? "text-slate-900"
                                        : "text-slate-500 hover:text-slate-900"
                                }`}
                            >
                                {cluster.is_active && (
                                    <IonIcon icon={checkmarkOutline} className="h-3.5 w-3.5" />
                                )}
                                {cluster.is_active ? "Active Target" : "Make Active"}
                            </button>

                            <button
                                onClick={() =>
                                    handleSpawnCluster(
                                        cluster.id,
                                        cluster.book_id,
                                        cluster.library_id,
                                        cluster.title,
                                    )
                                }
                                className="inline-flex items-center gap-1 px-0 py-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-900"
                            >
                                <IonIcon icon={addOutline} className="h-3.5 w-3.5" />
                                Empty Branch
                            </button>
                        </div>
                        {originContext?.title || originContext?.text ? (
                            <div className="mt-4 border-t border-slate-100 pt-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    Source Context
                                </div>
                                {originContext?.title ? (
                                    <div className="mt-2 text-[13px] font-semibold text-slate-900">
                                        {originContext.title}
                                    </div>
                                ) : null}
                                {originContext?.text ? (
                                    <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">
                                        {originContext.text}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3 custom-scrollbar">
                        {orderedChunks.length === 0 ? (
                            <div className="px-1 py-6 text-sm text-slate-500">
                                No saved echoes in this branch yet.
                            </div>
                        ) : (
                            orderedChunks.map((chunk: any) => {
                                const echoId = String(
                                    chunk.echo_id || chunk.chunk_id || "",
                                );
                                return (
                                    <SavedEchoCard
                                        key={`${cluster.id}-${echoId}`}
                                        chunk={chunk}
                                        clusterId={cluster.id}
                                        clusterTitle={cluster.title}
                                        isExpanded={expandedEchoId === echoId}
                                        onToggleExpand={() =>
                                            onToggleEchoExpand(cluster.id, echoId)
                                        }
                                        onManageNotes={(nextEchoId) =>
                                            setViewingEchoNotes({
                                                echoId: nextEchoId,
                                            })
                                        }
                                        onDeleteSuccess={refreshGlobalCanvas}
                                        linkedNoteIds={
                                            localLinkedNotes[
                                                chunk.echo_id || chunk.chunk_id
                                            ] || []
                                        }
                                        branchCount={
                                            branchCountByEchoId[echoId] || 0
                                        }
                                        onShowBranches={() =>
                                            onShowBranches(echoId)
                                        }
                                        onCreateBranchFromHighlight={(text) =>
                                            onCreateBranchFromHighlight({
                                                text,
                                                sourceEchoId: echoId,
                                                parentClusterId: cluster.id,
                                                parentClusterTitle: cluster.title,
                                                bookId:
                                                    cluster.book_id ||
                                                    cluster.title,
                                                libraryId:
                                                    cluster.library_id || "",
                                                originContext: {
                                                    title:
                                                        chunk.title ||
                                                        cluster.title ||
                                                        "Source Echo",
                                                    text,
                                                    chapter:
                                                        chunk.chapter ||
                                                        "Unknown Chapter",
                                                    source_label:
                                                        chunk.filename ||
                                                        cluster.title ||
                                                        "",
                                                    echo_id: echoId,
                                                    cluster_id: cluster.id,
                                                    book_id:
                                                        cluster.book_id ||
                                                        cluster.title,
                                                    library_id:
                                                        cluster.library_id || "",
                                                    filename:
                                                        String(chunk.filename || ""),
                                                    chunk_id:
                                                        String(chunk.chunk_id || ""),
                                                    chunk_ref:
                                                        String(chunk.chunk_ref || ""),
                                                    source_lid:
                                                        String(chunk.source_lid || ""),
                                                },
                                            })
                                        }
                                        onAskRagFromHighlight={
                                            onAskRagFromHighlight
                                        }
                                        onClearHighlightRagComposer={
                                            onClearHighlightRagComposer
                                        }
                                        selectionMode={selectionMode}
                                        isSelected={isEchoSelected?.(echoId)}
                                        onToggleSelect={() =>
                                            onToggleEchoSelect?.(chunk)
                                        }
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </DraggableColumn>
        );
    },
);

export default SavedClusterColumn;
