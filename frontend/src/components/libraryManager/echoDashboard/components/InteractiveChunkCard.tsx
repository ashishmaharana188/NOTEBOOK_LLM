import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { IonIcon } from "@ionic/react";
import {
    bookmarkOutline,
    chatbubbleEllipsesOutline,
    checkmarkOutline,
    chevronDownOutline,
    chevronUpOutline,
    colorWandOutline,
    createOutline,
    searchOutline,
    trashOutline,
} from "ionicons/icons";
import type { EchoChunk } from "../echoTypes";
import ExpandableChunkCard from "./ExpandableChunkCard";
import { useModelRuntime } from "../../../system/ModelRuntimeProvider";
import { buildApiUrl } from "../../../../lib/runtimeConfig";
import {
    createMarkerFromSelection,
    createMarkerFromQuote,
    renderMarkedText,
    type EchoMarker,
} from "../utils/markerUtils";

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
        onClearHighlightRagComposer,
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
            sourceKey?: string;
        }) => void;
        onClearHighlightRagComposer?: (sourceKey?: string) => void;
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
        const [activeMarker, setActiveMarker] = useState<EchoMarker | null>(null);
        const contextRef = useRef<HTMLDivElement | null>(null);
        const containerRef = useRef<HTMLDivElement | null>(null);
        const selectionSourceKeyRef = useRef(
            `incoming:${sourceAnchorId}:${String((chunk as any).chunk_id || (chunk as any).echo_id || chunk.title || "echo")}`,
        );
        const selectionSyncKeyRef = useRef("");
        const savedClusterIdRef = useRef<string | null>(
            targetClusterId || String((chunk as any).cluster_id || "") || null,
        );

        const getSelectionWithinContext = useCallback(() => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !contextRef.current) {
                return null;
            }

            const text = selection.toString().trim();
            if (!text || text.length < 2) {
                return null;
            }

            const anchorNode = selection.anchorNode;
            const focusNode = selection.focusNode;
            if (
                (anchorNode && !contextRef.current.contains(anchorNode)) ||
                (focusNode && !contextRef.current.contains(focusNode))
            ) {
                return null;
            }

            const marker =
                createMarkerFromSelection(
                contextRef.current,
                String(chunk.text || ""),
                "excerpt",
            ) ||
                createMarkerFromQuote(
                    String(chunk.text || ""),
                    text,
                    "excerpt",
                );
            if (!marker) return null;

            return { text, marker };
        }, [chunk]);

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
                setActiveMarker(null);
                setShowHighlightMenu(false);
                selectionSyncKeyRef.current = "";
                onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
            }
        }, [isCollapsed, onClearHighlightRagComposer]);

        useEffect(
            () => () => {
                onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
            },
            [onClearHighlightRagComposer],
        );

        const captureSelection = useCallback(() => {
            window.setTimeout(() => {
                const payload = getSelectionWithinContext();
                if (!payload) return;
                setSelectionText(payload.text);
                setActiveMarker(payload.marker);
            }, 0);
        }, [getSelectionWithinContext]);

        const clearEphemeralHighlight = useCallback(() => {
            setSelectionText("");
            setActiveMarker(null);
            setShowHighlightMenu(false);
            selectionSyncKeyRef.current = "";
            onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
            window.getSelection()?.removeAllRanges();
        }, [onClearHighlightRagComposer]);

        useEffect(() => {
            if (isCollapsed) return;

            document.addEventListener("selectionchange", captureSelection);
            return () => {
                document.removeEventListener("selectionchange", captureSelection);
            };
        }, [captureSelection, isCollapsed]);

        useEffect(() => {
            if (!onAskRagFromHighlight) return;
            if (isCollapsed) {
                selectionSyncKeyRef.current = "";
                onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
                return;
            }

            const trimmed = selectionText.trim();
            if (!trimmed || !activeMarker) {
                return;
            }

            const nextSyncKey = `${selectionSourceKeyRef.current}:${trimmed}:${activeMarker.marker_id || activeMarker.start_offset || 0}`;
            if (selectionSyncKeyRef.current === nextSyncKey) {
                return;
            }

            selectionSyncKeyRef.current = nextSyncKey;
            onAskRagFromHighlight({
                text: trimmed,
                title: customTitle || sourceLabel || "Selected Highlight",
                chapter: chunk.chapter || "Unknown Chapter",
                sourceLabel,
                sourceAnchorId,
                sourceKey: selectionSourceKeyRef.current,
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
                    filename: String((chunk as any).filename || ""),
                    chunk_id: String((chunk as any).chunk_id || ""),
                    chunk_ref: String((chunk as any).chunk_ref || ""),
                    source_lid: String((chunk as any).source_lid || ""),
                    full_text: String((chunk as any).full_text || chunk.text || ""),
                    marker: activeMarker,
                },
            });
        }, [
            activeBookTitle,
            activeMarker,
            bookId,
            chunk,
            customTitle,
            echoId,
            isCollapsed,
            libraryId,
            onAskRagFromHighlight,
            onClearHighlightRagComposer,
            selectionText,
            sourceAnchorId,
            sourceLabel,
            targetClusterId,
        ]);

        useEffect(() => {
            if (!activeMarker?.quote || isCollapsed) return;
            const handlePointerDown = (event: MouseEvent) => {
                const target = event.target as HTMLElement | null;
                if (
                    target?.closest(
                        "[data-selection-ignore='true'], [data-marker-persist='true']",
                    )
                ) {
                    return;
                }
                if (containerRef.current?.contains(target as Node)) {
                    return;
                }
                clearEphemeralHighlight();
            };

            document.addEventListener("mousedown", handlePointerDown);
            return () => {
                document.removeEventListener("mousedown", handlePointerDown);
            };
        }, [activeMarker, clearEphemeralHighlight, isCollapsed]);

        const handleSelectionToggle = useCallback(
            (event: React.MouseEvent<HTMLDivElement>) => {
                if (!selectionMode || !onToggleSelect) return;
                const target = event.target as HTMLElement | null;
                if (
                    target?.closest("button, input, textarea, a, [data-selection-ignore='true']")
                ) {
                    return;
                }
                if (window.getSelection()?.toString().trim()) {
                    return;
                }
                event.stopPropagation();
                onToggleSelect();
            },
            [onToggleSelect, selectionMode],
        );

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
            const nextSelection =
                selectionText.trim() || getSelectionWithinContext();
            if (!nextSelection || !onCreateBranchFromHighlight) return;
            const nextSelectionText =
                (typeof nextSelection === "string"
                    ? nextSelection
                    : nextSelection?.text) ||
                "";
            if (!nextSelectionText) return;

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
                text: nextSelectionText,
                echoId: currentEchoRef.echoId,
                clusterId: currentEchoRef.clusterId,
            });
            setShowHighlightMenu(false);
        };

        const handleAskRag = () => {
            const payload = getSelectionWithinContext();
            const nextSelection =
                (payload?.text || selectionText || "").trim();
            const nextMarker = payload?.marker || activeMarker;
            if (!nextSelection || !nextMarker || !onAskRagFromHighlight) return;
            setSelectionText(nextSelection);
            setActiveMarker(nextMarker);
            onAskRagFromHighlight({
                text: nextSelection,
                title: customTitle || sourceLabel || "Selected Highlight",
                chapter: chunk.chapter || "Unknown Chapter",
                sourceLabel,
                sourceAnchorId,
                sourceKey: selectionSourceKeyRef.current,
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
                    filename: String((chunk as any).filename || ""),
                    chunk_id: String((chunk as any).chunk_id || ""),
                    chunk_ref: String((chunk as any).chunk_ref || ""),
                    source_lid: String((chunk as any).source_lid || ""),
                    full_text: String((chunk as any).full_text || chunk.text || ""),
                    marker: nextMarker,
                },
            });
            setShowHighlightMenu(false);
        };

        if (isDeleted) return null;

        return (
            <div
                ref={containerRef}
                onClick={handleSelectionToggle}
                className={`mb-4 overflow-hidden border bg-white shadow-sm transition-colors ${
                    isSelected
                        ? "border-black"
                        : "border-slate-200 hover:border-slate-300"
                } ${selectionMode ? "cursor-pointer" : ""}`}
            >
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
                                onClick={() => setIsCollapsed((prev) => !prev)}
                                title={isCollapsed ? "Expand card" : "Minimize card"}
                                className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:text-slate-900"
                            >
                                {isCollapsed ? (
                                    <IonIcon icon={chevronDownOutline} className="h-4 w-4" />
                                ) : (
                                    <IonIcon icon={chevronUpOutline} className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                onClick={handleOpenNoteManager}
                                disabled={isProcessing}
                                title="Manage notes"
                                className="flex h-8 w-8 items-center justify-center text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50"
                            >
                                <IonIcon icon={createOutline} className="h-4 w-4" />
                            </button>
                            {linkedNoteCount > 0 && (
                                <span className="px-1 text-[10px] font-bold text-slate-500">
                                    {linkedNoteCount}
                                </span>
                            )}
                            <div className="relative" data-selection-ignore="true">
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() =>
                                        setShowHighlightMenu((prev) => !prev)
                                    }
                                    disabled={isProcessing || isCollapsed}
                                    title="Highlight Actions"
                                    aria-label="Highlight Actions"
                                    className={`flex h-8 w-8 items-center justify-center transition-colors disabled:opacity-40 ${
                                        ((selectionText || activeMarker?.quote) && !isCollapsed)
                                            ? "text-slate-700 hover:text-slate-900"
                                            : "text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    <IonIcon icon={colorWandOutline} className="h-4 w-4" />
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
                                            <span className="inline-flex items-center gap-2">
                                                <IonIcon icon={searchOutline} className="h-3.5 w-3.5" />
                                                <span>Find Echoes</span>
                                            </span>
                                        </button>
                                        <button
                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={handleAskRag}
                                            disabled={!onAskRagFromHighlight}
                                            className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                <IonIcon icon={chatbubbleEllipsesOutline} className="h-3.5 w-3.5" />
                                                <span>Ask RAG</span>
                                            </span>
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
                                    <IonIcon icon={checkmarkOutline} className="h-4 w-4" />
                                ) : (
                                    <IonIcon icon={bookmarkOutline} className="h-4 w-4" />
                                )}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isProcessing}
                                title="Remove card"
                                className="flex h-8 w-8 items-center justify-center text-slate-400 transition-colors hover:text-red-600 disabled:opacity-50"
                            >
                                <IonIcon icon={trashOutline} className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {!isCollapsed && (
                    <div
                        ref={contextRef}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseUp={captureSelection}
                        onKeyUp={captureSelection}
                        onTouchEnd={captureSelection}
                        className="no-pan bg-white px-4 py-4 select-text cursor-text selection:bg-[#f3dd73] selection:text-slate-900 sm:px-5 sm:py-5"
                        style={{ userSelect: "text", WebkitUserSelect: "text" }}
                    >
                        <p className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800 selection:bg-[#f3dd73] selection:text-slate-900">
                            {renderMarkedText(
                                String(chunk.text || ""),
                                [],
                                activeMarker,
                                `incoming:${selectionSourceKeyRef.current}`,
                            )}
                        </p>
                        <ExpandableChunkCard chunk={chunk} />
                    </div>
                )}
            </div>
        );
    },
);

export default InteractiveChunkCard;
