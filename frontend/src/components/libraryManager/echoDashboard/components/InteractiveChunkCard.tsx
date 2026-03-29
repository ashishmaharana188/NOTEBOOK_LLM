import React, { useCallback, useEffect, useRef, useState } from "react";
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
        onCreateBranchFromHighlight,
        onAskRagFromHighlight,
        selectionMode = false,
        isSelected = false,
        onToggleSelect,
        sourceAnchorId = "",
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
        onCreateBranchFromHighlight?: (payload: {
            text: string;
            echoId: string;
            clusterId: string;
        }) => Promise<void> | void;
        onAskRagFromHighlight?: (payload: {
            text: string;
            title: string;
            chapter: string;
            sourceLabel: string;
            sourceAnchorId: string;
            selectionRefs: any[];
            contextExtras: Record<string, any>;
        }) => void;
        selectionMode?: boolean;
        isSelected?: boolean;
        onToggleSelect?: () => void;
        sourceAnchorId?: string;
    }) => {
        const { ensureRolesThen } = useModelRuntime();
        const isPreSaved =
            chunk.relation === "Compound Echo" ||
            chunk.relation === "Saved Insight";
        const [isSaved, setIsSaved] = useState(isPreSaved);
        const [isDeleted, setIsDeleted] = useState(false);
        const [isProcessing, setIsProcessing] = useState(false);
        const [isCollapsed, setIsCollapsed] = useState(false);
        const [showHighlightMenu, setShowHighlightMenu] = useState(false);
        const [echoId, setEchoId] = useState<string | null>(
            isPreSaved ? String((chunk as any).echo_id || "") : null,
        );
        const [savedClusterId, setSavedClusterId] = useState<string | null>(
            targetClusterId || null,
        );
        const [customTitle, setCustomTitle] = useState(chunk.title || "");
        const [selectionText, setSelectionText] = useState("");
        const contextRef = useRef<HTMLDivElement | null>(null);
        const savedClusterIdRef = useRef<string | null>(
            targetClusterId || String((chunk as any).cluster_id || "") || null,
        );

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

        const resolvedLinkedNoteIds = linkedNoteIds.filter(Boolean);
        const linkedNoteCount = resolvedLinkedNoteIds.length;
        const sourceLabel = (chunk as any).filename || activeBookTitle;

        useEffect(() => {
            if (targetClusterId) {
                setSavedClusterId(targetClusterId);
            }
        }, [targetClusterId]);

        useEffect(() => {
            savedClusterIdRef.current =
                savedClusterId ||
                targetClusterId ||
                String((chunk as any).cluster_id || "") ||
                null;
        }, [chunk, savedClusterId, targetClusterId]);

        useEffect(() => {
            if (isCollapsed) {
                setSelectionText("");
                setShowHighlightMenu(false);
            }
        }, [isCollapsed]);

        const captureSelection = useCallback(() => {
            window.setTimeout(() => {
                setSelectionText(getSelectionWithinContext());
            }, 0);
        }, [getSelectionWithinContext]);

        useEffect(() => {
            if (isCollapsed) return;

            document.addEventListener("selectionchange", captureSelection);
            return () => {
                document.removeEventListener("selectionchange", captureSelection);
            };
        }, [captureSelection, isCollapsed]);

        const handleSaveAndReturnRef = async () => {
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
                        return {
                            echoId,
                            clusterId:
                                savedClusterIdRef.current ||
                                String(res.data.cluster_id || ""),
                        };
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
                    setSavedClusterId(nextClusterId || null);
                    savedClusterIdRef.current = nextClusterId || null;
                    chunk.relation = "Saved Insight";
                    (chunk as any).chunk_id = nextEchoId;
                    (chunk as any).echo_id = nextEchoId;
                    (chunk as any).cluster_id = nextClusterId;
                    if (onSaveSuccess) onSaveSuccess();
                    onEchoSaved?.({
                        echoId: nextEchoId,
                        clusterId: nextClusterId,
                        created: true,
                    });
                    return {
                        echoId: nextEchoId,
                        clusterId: nextClusterId,
                    };
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
            let currentEchoRef =
                echoId && (savedClusterIdRef.current || targetClusterId)
                    ? {
                          echoId,
                          clusterId:
                              savedClusterIdRef.current ||
                              targetClusterId ||
                              "",
                      }
                    : null;
            if (!isSaved || !currentEchoRef) currentEchoRef = await handleSaveAndReturnRef();
            if (currentEchoRef?.echoId) {
                onManageNotes(currentEchoRef.echoId);
            }
        };

        const handleSearchHighlight = async () => {
            const nextSelection = selectionText || getSelectionWithinContext();
            if (!nextSelection || !onCreateBranchFromHighlight) return;

            const currentEchoRef =
                echoId && (savedClusterIdRef.current || targetClusterId)
                    ? {
                          echoId,
                          clusterId:
                              savedClusterIdRef.current ||
                              targetClusterId ||
                              "",
                      }
                    : await handleSaveAndReturnRef();

            if (!currentEchoRef?.echoId || !currentEchoRef?.clusterId) {
                return;
            }

            await onCreateBranchFromHighlight({
                text: nextSelection,
                echoId: currentEchoRef.echoId,
                clusterId: currentEchoRef.clusterId,
            });
            setShowHighlightMenu(false);
            setSelectionText("");
            window.getSelection()?.removeAllRanges();
        };

        const handleAskRag = () => {
            const nextSelection = selectionText || getSelectionWithinContext();
            if (!nextSelection || !onAskRagFromHighlight) return;
            onAskRagFromHighlight({
                text: nextSelection,
                title: customTitle || sourceLabel || "Selected Highlight",
                chapter: chunk.chapter || "Unknown Chapter",
                sourceLabel,
                sourceAnchorId,
                selectionRefs: [
                    {
                        kind: echoId ? "echo" : "incoming_echo",
                        id: echoId || String((chunk as any).chunk_id || ""),
                        label: customTitle || sourceLabel || "Selected Highlight",
                        cluster_id: savedClusterIdRef.current || targetClusterId || "",
                        echo_id: echoId || "",
                    },
                ],
                contextExtras: {
                    echo_id: echoId || "",
                    cluster_id: savedClusterIdRef.current || targetClusterId || "",
                    book_id: bookId || activeBookTitle,
                    library_id: libraryId || "",
                },
            });
            setShowHighlightMenu(false);
            setSelectionText("");
            window.getSelection()?.removeAllRanges();
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
                                        handleSaveAndReturnRef();
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
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    onToggleSelect?.();
                                }}
                                title={isSelected ? "Unselect echo" : "Select echo"}
                                className={`${
                                    selectionMode ? "flex" : "hidden"
                                } h-8 w-8 items-center justify-center border transition-colors ${
                                    isSelected
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-400 hover:border-slate-500 hover:text-slate-700"
                                }`}
                            >
                                {isSelected && <CheckIcon className="h-4 w-4" />}
                            </button>
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
                            <div className="relative">
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() =>
                                        setShowHighlightMenu((prev) => !prev)
                                    }
                                    disabled={isProcessing || isCollapsed}
                                    title="Highlight actions"
                                    className={`flex h-8 items-center justify-center px-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40 ${
                                        selectionText && !isCollapsed
                                            ? "text-slate-700 hover:text-slate-900"
                                            : "text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    Highlight
                                </button>
                                {showHighlightMenu && !isCollapsed && (
                                    <div className="absolute right-0 top-9 z-30 min-w-[140px] border border-slate-200 bg-white p-1 shadow-lg">
                                        <button
                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={handleSearchHighlight}
                                            disabled={!onCreateBranchFromHighlight}
                                            className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                        >
                                            <span>Find Echoes</span>
                                        </button>
                                        <button
                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={handleAskRag}
                                            disabled={!onAskRagFromHighlight}
                                            className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                        >
                                            <span>Ask RAG</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={handleSaveAndReturnRef}
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
                    <div
                        ref={contextRef}
                        onMouseUp={captureSelection}
                        onKeyUp={captureSelection}
                        onTouchEnd={captureSelection}
                        className="bg-white px-4 py-4 select-text sm:px-5 sm:py-5"
                    >
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
