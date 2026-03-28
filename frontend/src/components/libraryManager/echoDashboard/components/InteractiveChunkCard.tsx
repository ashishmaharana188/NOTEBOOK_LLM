import React, { useState } from "react";
import axios from "axios";
import {
    BookmarkSquareIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PencilSquareIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import type { EchoChunk } from "../echoTypes";
import ExpandableChunkCard from "./ExpandableChunkCard";
import { useModelRuntime } from "../../../system/ModelRuntimeProvider";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

const InteractiveChunkCard = React.memo(
    ({
        chunk,
        libraryId,
        activeBookTitle,
        onManageNotes,
        onSaveSuccess,
        linkedNoteIds = [],
        bookId,
        targetClusterId,
        resolveTargetClusterId,
        onEchoSaved,
    }: {
        chunk: EchoChunk;
        chunkIndex: number;
        query: string;
        bookId?: string;
        activeBookTitle: string;
        onNoteClick: (data: {
            markdown: string;
            title: string;
            echoId: string;
        }) => void;
        onManageNotes: (echoId: string) => void;
        onSaveSuccess?: () => void;
        linkedNoteIds?: string[];
        libraryId?: string;
        targetClusterId?: string;
        resolveTargetClusterId?: () => Promise<string | null>;
        onEchoSaved?: (payload: {
            echoId: string;
            clusterId: string;
            created: boolean;
        }) => void;
    }) => {
        const { ensureRolesThen } = useModelRuntime();
        const isPreSaved =
            chunk.relation === "Compound Echo" ||
            chunk.relation === "Saved Insight";
        const [isSaved, setIsSaved] = useState(isPreSaved);
        const [isDeleted, setIsDeleted] = useState(false);
        const [isProcessing, setIsProcessing] = useState(false);
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [echoId, setEchoId] = useState<string | null>(
            isPreSaved ? String((chunk as any).echo_id || "") : null,
        );
        const [customTitle, setCustomTitle] = useState(chunk.title || "");

        const resolvedLinkedNoteIds = linkedNoteIds.filter(Boolean);
        const linkedNoteCount = resolvedLinkedNoteIds.length;
        const sourceLabel = (chunk as any).filename || activeBookTitle;

        const handleSaveAndReturnId = async () => {
            setIsProcessing(true);
            try {
                if (isSaved && echoId) {
                    const res = await axios.put(
                        buildApiUrl("/brain/echo/update_title"),
                        {
                            echo_id: echoId,
                            title: customTitle || "Untitled Snippet",
                            chunk_id: String((chunk as any).chunk_id || ""),
                        },
                    );
                    if (res.data.status === "success") {
                        if (onSaveSuccess) onSaveSuccess();
                        return echoId;
                    }
                    return null;
                }

                let clusterId = targetClusterId || "";
                if (!clusterId && resolveTargetClusterId) {
                    clusterId = (await resolveTargetClusterId()) || "";
                }

                const res = await ensureRolesThen(["embedding"], () =>
                    axios.post(buildApiUrl("/brain/echo/save"), {
                        book_id: bookId || activeBookTitle,
                        library_id: libraryId || "",
                        cluster_id: clusterId,
                        highlight: chunk.text,
                        context: chunk.chapter || "Unknown Context",
                        ai_insight:
                            chunk.bridge ||
                            chunk.relation ||
                            "Semantic Resonance Detected",
                        filename: sourceLabel,
                        source_lid: (chunk as any).source_lid || "",
                        original_chunk_id: String(
                            (chunk as any).chunk_id || "",
                        ),
                        title: customTitle || "Untitled Snippet",
                    }),
                );
                if (!res) return null;
                if (res.data.status === "success") {
                    const nextEchoId = String(res.data.echo_id || "");
                    const nextClusterId = String(res.data.cluster_id || clusterId);
                    setIsSaved(true);
                    setEchoId(nextEchoId);
                    chunk.relation = "Saved Insight";
                    (chunk as any).chunk_id = nextEchoId;
                    if (onSaveSuccess) onSaveSuccess();
                    onEchoSaved?.({
                        echoId: nextEchoId,
                        clusterId: nextClusterId,
                        created: true,
                    });
                    return nextEchoId;
                }
            } catch (e) {
                console.error("Failed to save/update echo:", e);
            } finally {
                setIsProcessing(false);
            }
            return null;
        };

        const handleDelete = async () => {
            setIsProcessing(true);
            try {
                if (isSaved && echoId) {
                    await axios.post(buildApiUrl("/brain/echo/delete"), {
                        echo_id: echoId,
                    });
                    setIsSaved(false);
                    setEchoId(null);
                    chunk.relation = "AI Insight";
                    (chunk as any).chunk_id = undefined;
                    if (onSaveSuccess) onSaveSuccess();
                } else {
                    setIsDeleted(true);
                }
            } catch (e) {
                console.error("Failed to delete echo:", e);
            } finally {
                setIsProcessing(false);
            }
        };

        const handleOpenNoteManager = async () => {
            let currentEchoId = echoId;
            if (!isSaved) currentEchoId = await handleSaveAndReturnId();
            if (currentEchoId) {
                onManageNotes(currentEchoId);
            }
        };

        if (isDeleted) return null;

        return (
            <div className="mb-4 overflow-hidden border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300">
                <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <input
                                type="text"
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        customTitle.trim() &&
                                        !isProcessing
                                    ) {
                                        e.preventDefault();
                                        handleSaveAndReturnId();
                                    }
                                }}
                                placeholder="Name this echo..."
                                className="w-full border-none bg-transparent p-0 text-[15px] font-semibold tracking-[-0.02em] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                <span>
                                    {chunk.chapter || "Unknown Chapter"}
                                </span>
                                <span className="truncate max-w-[180px]">
                                    {sourceLabel}
                                </span>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                onClick={() => setIsCollapsed((prev) => !prev)}
                                title={isCollapsed ? "Expand card" : "Minimize card"}
                                className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:text-slate-900"
                            >
                                {isCollapsed ? (
                                    <ChevronDownIcon className="h-4 w-4" />
                                ) : (
                                    <ChevronUpIcon className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                onClick={handleOpenNoteManager}
                                disabled={isProcessing}
                                title="Manage notes"
                                className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
                            >
                                <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            {linkedNoteCount > 0 && (
                                <span className="px-1 text-[10px] font-bold text-slate-500">
                                    {linkedNoteCount}
                                </span>
                            )}
                            <button
                                onClick={handleSaveAndReturnId}
                                disabled={isProcessing}
                                title={isSaved ? "Update title" : "Save echo"}
                                className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                                ) : isSaved ? (
                                    <CheckIcon className="h-4 w-4" />
                                ) : (
                                    <BookmarkSquareIcon className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isProcessing}
                                title="Remove card"
                                className="flex h-8 w-8 items-center justify-center text-slate-400 transition-colors hover:text-red-600 disabled:opacity-50"
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className="bg-white px-4 py-4 sm:px-5 sm:py-5">
                        <p className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">
                            {chunk.text}
                        </p>
                        <ExpandableChunkCard chunk={chunk} />
                    </div>
                )}
            </div>
        );
    },
);

export default InteractiveChunkCard;
