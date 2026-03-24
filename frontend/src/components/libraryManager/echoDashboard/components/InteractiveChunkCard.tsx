import React, { useState } from "react";
import axios from "axios";
import {
    CheckIcon,
    TrashIcon,
    PencilSquareIcon,
} from "@heroicons/react/24/outline";
import type { EchoChunk } from "../echoTypes";
import ExpandableChunkCard from "./ExpandableChunkCard";
import { useModelRuntime } from "../../../system/ModelRuntimeProvider";

const InteractiveChunkCard = React.memo(
    ({
        chunk,
        chunkIndex,
        libraryId,
        query,
        activeBookTitle,
        onNoteClick,
        bookId,
        onManageNotes,
        onSaveSuccess,
        linkedNoteIds = [],
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
    }) => {
        const { ensureRolesThen } = useModelRuntime();
        const isPreSaved =
            chunk.relation === "Compound Echo" ||
            chunk.relation === "Saved Insight";
        const [isSaved, setIsSaved] = useState(isPreSaved);
        const [isDeleted, setIsDeleted] = useState(false);
        const [isProcessing, setIsProcessing] = useState(false);
        const [echoId, setEchoId] = useState<string | null>(
            isPreSaved ? String((chunk as any).echo_id || "") : null,
        );
        const [customTitle, setCustomTitle] = useState(chunk.title || "");

        const resolvedLinkedNoteIds = linkedNoteIds.filter(Boolean);
        const linkedNoteCount = resolvedLinkedNoteIds.length;
        const hasLink = linkedNoteCount > 0;

        const handleSaveAndReturnId = async () => {
            setIsProcessing(true);
            try {
                if (isSaved && echoId) {
                    const res = await axios.put(
                        "https://doomprompting123-space.hf.space/brain/echo/update_title",
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
                } else {
                    const res = await ensureRolesThen(["embedding"], () =>
                        axios.post(
                            "https://doomprompting123-space.hf.space/brain/echo/save",
                            {
                                book_id: bookId || activeBookTitle,
                                library_id: libraryId || "",
                                highlight: chunk.text,
                                context: chunk.chapter || "Unknown Context",
                                ai_insight:
                                    chunk.bridge ||
                                    chunk.relation ||
                                    "Semantic Resonance Detected",
                                filename:
                                    (chunk as any).filename || activeBookTitle,
                                source_lid: (chunk as any).source_lid || "",
                                original_chunk_id: String(
                                    (chunk as any).chunk_id || "",
                                ),
                                title: customTitle || "Untitled Snippet",
                            },
                        ),
                    );
                    if (!res) return null;
                    if (res.data.status === "success") {
                        setIsSaved(true);
                        setEchoId(res.data.echo_id);
                        chunk.relation = "Saved Insight";
                        (chunk as any).chunk_id = res.data.echo_id;
                        if (onSaveSuccess) onSaveSuccess();
                        return res.data.echo_id;
                    }
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
                    await axios.post(
                        "https://doomprompting123-space.hf.space/brain/echo/delete",
                        {
                            echo_id: echoId,
                        },
                    );
                    setIsSaved(false);
                    setEchoId(null);
                    chunk.relation = "AI Insight";
                    (chunk as any).chunk_id = undefined;
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
            <div className="bg-surface border border-slate-200 shadow-sm rounded-lg flex flex-col group hover:shadow-md hover:border-slate-300 transition-all duration-200 mb-4 overflow-hidden relative">
                {/* TOP COMPACT ACTION HEADER */}
                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center relative z-10">
                    {/* LEFT: Compact Actions */}
                    <div className="flex items-center gap-1">
                        {hasLink ? (
                            <button
                                onClick={handleOpenNoteManager}
                                title="Manage Linked Notes"
                                className="p-1 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                            >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleOpenNoteManager}
                                disabled={isProcessing}
                                title="Add Note to this Echo"
                                className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {linkedNoteCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[8px] font-black leading-none">
                                {linkedNoteCount}
                            </span>
                        )}

                        <button
                            onClick={handleDelete}
                            disabled={isProcessing}
                            title="Delete Echo"
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* RIGHT: Source/Semantic Match Tag */}
                    <div className="flex items-center gap-2">
                        <span
                            className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[150px]"
                            title={(chunk as any).filename || activeBookTitle}
                        >
                            {(chunk as any).filename || activeBookTitle}
                        </span>
                        <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                            {chunk.relation || "AI Bridge"}
                        </span>
                    </div>
                </div>

                {/* CORE CONTENT SKELETON */}
                <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2 group/title border-b border-transparent focus-within:border-slate-200 transition-colors pb-1">
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
                            placeholder="Name this insight..."
                            className="w-full text-base font-extrabold text-slate-800 border-none bg-transparent focus:outline-none focus:ring-0 p-0 placeholder-slate-300 transition-colors hover:text-blue-600 focus:text-blue-600"
                        />
                        {customTitle.trim() && (
                            <button
                                onClick={handleSaveAndReturnId}
                                disabled={isProcessing}
                                title="Save Title"
                                className="p-1 text-slate-400 hover:text-emerald-600 active:scale-90 transition-all opacity-0 group-hover/title:opacity-100 focus:opacity-100 disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <CheckIcon className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>

                    <h5
                        className="font-semibold text-slate-700 text-xs leading-relaxed mb-3 line-clamp-2"
                        title={chunk.bridge || "Semantic Resonance Detected"}
                    >
                        {chunk.bridge || "Semantic Resonance Detected"}
                    </h5>

                    {query && (
                        <div className="mb-3 bg-slate-50 p-2 rounded border border-slate-100">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                Triggered By
                            </p>
                            <p
                                className="text-[10px] text-slate-600 italic leading-relaxed border-l-2 border-slate-300 pl-2 line-clamp-2"
                                title={query}
                            >
                                "{query}"
                            </p>
                        </div>
                    )}

                    {/* Pass down simplified sizing to the expander if needed */}
                    <ExpandableChunkCard chunk={chunk} />
                </div>
            </div>
        );
    },
);
export default InteractiveChunkCard;
