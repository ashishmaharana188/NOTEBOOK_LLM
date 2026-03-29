import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    ChevronDownIcon,
    ChevronUpIcon,
} from "@heroicons/react/24/outline";
import type { EchoChunk } from "../echoTypes";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

export default function SavedEchoCard({
    chunk,
    clusterId,
    clusterTitle,
    isExpanded,
    onToggleExpand,
    onManageNotes,
    onDeleteSuccess,
    linkedNoteIds = [],
    branchCount = 0,
    onShowBranches,
    onCreateBranchFromHighlight,
}: {
    chunk: EchoChunk;
    clusterId: string;
    clusterTitle: string;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onManageNotes: (echoId: string) => void;
    onDeleteSuccess?: () => void;
    linkedNoteIds?: string[];
    branchCount?: number;
    onShowBranches?: () => void;
    onCreateBranchFromHighlight?: (text: string) => Promise<void> | void;
}) {
    const echoId = String((chunk as any).echo_id || (chunk as any).chunk_id || "");
    const [customTitle, setCustomTitle] = useState(chunk.title || "Untitled Echo");
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectionText, setSelectionText] = useState("");
    const [fullText, setFullText] = useState(chunk.text);
    const [showFullContext, setShowFullContext] = useState(false);
    const [loadingContext, setLoadingContext] = useState(false);
    const contextRef = useRef<HTMLDivElement | null>(null);

    const getSelectionWithinContext = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !contextRef.current) {
            return "";
        }

        const text = selection.toString().trim();
        if (!text || text.length < 6) {
            return "";
        }

        const anchorNode = selection.anchorNode;
        const focusNode = selection.focusNode;
        if (
            (anchorNode && !contextRef.current.contains(anchorNode)) ||
            (focusNode && !contextRef.current.contains(focusNode))
        ) {
            return "";
        }

        return text;
    }, []);

    useEffect(() => {
        setCustomTitle(chunk.title || "Untitled Echo");
    }, [chunk.title]);

    useEffect(() => {
        if (!isExpanded) {
            setSelectionText("");
        }
    }, [isExpanded]);

    const captureSelection = useCallback(() => {
        window.setTimeout(() => {
            setSelectionText(getSelectionWithinContext());
        }, 0);
    }, [getSelectionWithinContext]);

    useEffect(() => {
        if (!isExpanded) return;

        document.addEventListener("selectionchange", captureSelection);
        return () => {
            document.removeEventListener("selectionchange", captureSelection);
        };
    }, [captureSelection, isExpanded]);

    const sourceLabel = useMemo(
        () => (chunk as any).filename || clusterTitle || "Saved Echo",
        [chunk, clusterTitle],
    );

    const handleSaveTitle = async () => {
        if (!echoId || !customTitle.trim()) return;
        setIsSavingTitle(true);
        try {
            await axios.put(buildApiUrl("/brain/echo/update_title"), {
                echo_id: echoId,
                title: customTitle.trim(),
                chunk_id: String((chunk as any).chunk_id || ""),
            });
            onDeleteSuccess?.();
        } catch (error) {
            console.error("Failed to update echo title", error);
        } finally {
            setIsSavingTitle(false);
        }
    };

    const handleDelete = async () => {
        if (!echoId) return;
        setIsDeleting(true);
        try {
            await axios.post(buildApiUrl("/brain/echo/delete"), { echo_id: echoId });
            onDeleteSuccess?.();
        } catch (error) {
            console.error("Failed to delete echo", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleFullContext = async () => {
        if (showFullContext) {
            setShowFullContext(false);
            return;
        }

        if (fullText !== chunk.text) {
            setShowFullContext(true);
            return;
        }

        const chunkId = String((chunk as any).chunk_id || "");
        const filename = String((chunk as any).filename || "");

        if (!chunkId || !filename) {
            setShowFullContext(true);
            return;
        }

        setLoadingContext(true);
        try {
            const res = await axios.post(buildApiUrl("/echo/expand_context"), {
                filename,
                chunk_id: chunkId,
                window: 4,
            });
            if (res.data?.status === "success" && res.data?.text) {
                setFullText(res.data.text);
            }
        } catch (error) {
            console.error("Failed to expand saved echo context", error);
        } finally {
            setLoadingContext(false);
            setShowFullContext(true);
        }
    };

    const runHighlightBranchSearch = async () => {
        const nextSelection = selectionText || getSelectionWithinContext();
        if (!nextSelection || !onCreateBranchFromHighlight) return;
        await onCreateBranchFromHighlight(nextSelection);
        setSelectionText("");
        window.getSelection()?.removeAllRanges();
    };

    return (
        <div
            data-cluster-id={clusterId}
            className="mb-3 overflow-hidden border border-slate-200 bg-white shadow-sm"
        >
            <div
                className={`flex items-start gap-3 px-4 py-3 sm:px-5 ${
                    isExpanded ? "" : "transition-colors hover:bg-slate-50"
                }`}
            >
                <div className="min-w-0 flex-1">
                    {isExpanded ? (
                        <input
                            type="text"
                            value={customTitle}
                            onChange={(e) => setCustomTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSavingTitle) {
                                    e.preventDefault();
                                    handleSaveTitle();
                                }
                            }}
                            className="w-full border-none bg-transparent p-0 text-[16px] font-semibold tracking-[-0.03em] text-slate-900 focus:outline-none focus:ring-0"
                        />
                    ) : (
                        <button
                            onClick={onToggleExpand}
                            className="w-full text-left"
                        >
                            <div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-slate-900">
                                {customTitle}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                <span>{chunk.chapter || "Unknown Chapter"}</span>
                                <span className="truncate max-w-[180px]">{sourceLabel}</span>
                            </div>
                        </button>
                    )}
                    {isExpanded && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            <span>{chunk.chapter || "Unknown Chapter"}</span>
                            <span className="truncate max-w-[180px]">{sourceLabel}</span>
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[10px] font-bold uppercase tracking-[0.16em]">
                    {isExpanded ? (
                        <>
                            <button
                                onClick={toggleFullContext}
                                className="px-0 py-0 text-slate-600 transition-colors hover:text-slate-900"
                            >
                                {loadingContext
                                    ? "Loading Context"
                                    : showFullContext
                                      ? "Collapse Context"
                                      : "Read Full Context"}
                            </button>
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={runHighlightBranchSearch}
                                disabled={!onCreateBranchFromHighlight}
                                className={`px-0 py-0 transition-colors ${
                                    selectionText
                                        ? "text-slate-900 hover:text-black"
                                        : "text-slate-500 hover:text-slate-900"
                                }`}
                            >
                                Search Highlight
                            </button>
                            {branchCount > 0 && onShowBranches && (
                                <button
                                    onClick={onShowBranches}
                                    className="px-0 py-0 text-slate-600 transition-colors hover:text-slate-900"
                                >
                                    Branches
                                </button>
                            )}
                            <button
                                onClick={() => onManageNotes(echoId)}
                                className="px-0 py-0 text-slate-600 transition-colors hover:text-slate-900"
                            >
                                {linkedNoteIds.length > 0
                                    ? `Notes ${linkedNoteIds.length}`
                                    : "Notes"}
                            </button>
                            <button
                                onClick={handleSaveTitle}
                                disabled={isSavingTitle || !customTitle.trim()}
                                className={`px-0 py-0 transition-colors ${
                                    isSavingTitle || !customTitle.trim()
                                        ? "text-slate-300"
                                        : "text-slate-600 hover:text-slate-900"
                                }`}
                            >
                                {isSavingTitle ? "Saving" : "Save"}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`px-0 py-0 transition-colors ${
                                    isDeleting
                                        ? "text-slate-300"
                                        : "text-slate-400 hover:text-red-600"
                                }`}
                            >
                                Delete
                            </button>
                            <button
                                onClick={onToggleExpand}
                                className="px-0 py-0 text-slate-500 transition-colors hover:text-slate-900"
                                aria-label="Collapse saved echo"
                            >
                                <ChevronUpIcon className="h-4 w-4" />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onToggleExpand}
                            className="px-0 py-0 text-slate-400 transition-colors hover:text-slate-900"
                            aria-label="Expand saved echo"
                        >
                            <ChevronDownIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5 sm:py-5">
                    <div className="relative overflow-hidden bg-white">
                        <div
                            ref={contextRef}
                            onMouseUp={captureSelection}
                            onKeyUp={captureSelection}
                            onTouchEnd={captureSelection}
                            className="max-h-[420px] overflow-y-auto px-0 py-0 font-serif text-[15px] leading-8 text-slate-800 select-text"
                        >
                            {loadingContext ? (
                                <div className="flex items-center gap-3 text-sm text-slate-500">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                                    Stitching full context...
                                </div>
                            ) : (
                                <div className="whitespace-pre-wrap">
                                    {showFullContext ? fullText : chunk.text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
