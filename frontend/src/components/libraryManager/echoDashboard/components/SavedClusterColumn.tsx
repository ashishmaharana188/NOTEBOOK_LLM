import React, { useMemo } from "react";
import { CheckIcon, PlusIcon } from "@heroicons/react/24/outline";
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
        onShowBranches,
        isHighlighted,
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
                                    <CheckIcon className="h-3.5 w-3.5" />
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
                                <PlusIcon className="h-3.5 w-3.5" />
                                Empty Branch
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 custom-scrollbar">
                        {orderedChunks.length === 0 ? (
                            <div className="border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
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
                                            })
                                        }
                                        onAskRagFromHighlight={
                                            onAskRagFromHighlight
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
