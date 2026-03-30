import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { IonIcon } from "@ionic/react";
import {
    bookmarkOutline,
    chatbubbleEllipsesOutline,
    chevronDownOutline,
    chevronUpOutline,
    colorWandOutline,
    documentTextOutline,
    gitBranchOutline,
    trashOutline,
} from "ionicons/icons";
import type { EchoChunk } from "../echoTypes";
import { buildApiUrl } from "../../../../lib/runtimeConfig";
import {
    createMarkerFromSelection,
    createMarkerFromQuote,
    markersMatch,
    renderMarkedText,
    type EchoMarker,
} from "../utils/markerUtils";

type SavedEchoCardProps = {
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
};

function EvidenceSection({ title, items }: { title: string; items: any[] }) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
        <section className="mt-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {title}
            </div>
            <div className="mt-2 space-y-3">
                {items.map((item: any, index: number) => (
                    <div key={`${title}-${index}`} className="text-[13px] leading-7 text-slate-700">
                        <div className="font-semibold text-slate-900">
                            {item.title || item.source_label || item.source || `${title} ${index + 1}`}
                        </div>
                        <div className="whitespace-pre-wrap">
                            {item.text || item.snippet || item.answer || ""}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

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
    onAskRagFromHighlight,
    onClearHighlightRagComposer,
    selectionMode = false,
    isSelected = false,
    onToggleSelect,
}: SavedEchoCardProps) {
    const echoId = String((chunk as any).echo_id || (chunk as any).chunk_id || "");
    const analysisMetadata = useMemo(
        () => ({ ...((chunk as any).analysis_metadata || {}) }),
        [chunk],
    );
    const isDerivedRun = Boolean(analysisMetadata.mode);
    const sourceLabel = useMemo(
        () => (chunk as any).filename || clusterTitle || "Saved Echo",
        [chunk, clusterTitle],
    );
    const savedMarkers = useMemo(
        () =>
            Array.isArray(analysisMetadata.saved_markers)
                ? (analysisMetadata.saved_markers as EchoMarker[])
                : [],
        [analysisMetadata.saved_markers],
    );
    const originContext = useMemo(
        () => ({ ...(analysisMetadata.origin_context || {}) }),
        [analysisMetadata.origin_context],
    );

    const [customTitle, setCustomTitle] = useState(chunk.title || "Untitled Echo");
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectionText, setSelectionText] = useState("");
    const [activeMarker, setActiveMarker] = useState<EchoMarker | null>(null);
    const [showHighlightMenu, setShowHighlightMenu] = useState(false);
    const [fullText, setFullText] = useState(String((chunk as any).full_text || chunk.text || ""));
    const [showFullContext, setShowFullContext] = useState(false);
    const [loadingContext, setLoadingContext] = useState(false);
    const contextRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const selectionSourceKeyRef = useRef(`saved:${clusterId}:${echoId}`);
    const selectionSyncKeyRef = useRef("");

    const displayText = showFullContext ? fullText : String(chunk.text || "");
    const compactSummary = String((chunk as any).bridge || "").trim();
    const activeSelectionText = selectionText.trim();
    const hasPersistentActiveMarker = useMemo(
        () =>
            Boolean(
                activeMarker &&
                    savedMarkers.some((marker) => markersMatch(marker, activeMarker)),
            ),
        [activeMarker, savedMarkers],
    );

    useEffect(() => {
        setCustomTitle(chunk.title || "Untitled Echo");
        setFullText(String((chunk as any).full_text || chunk.text || ""));
    }, [chunk]);

    useEffect(() => {
        if (!isExpanded) {
            setSelectionText("");
            setActiveMarker(null);
            setShowHighlightMenu(false);
            selectionSyncKeyRef.current = "";
            onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
        }
    }, [isExpanded, onClearHighlightRagComposer]);

    useEffect(
        () => () => {
            onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
        },
        [onClearHighlightRagComposer],
    );

    const getSelectionPayload = useCallback(() => {
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
            displayText,
            showFullContext ? "full" : "excerpt",
        ) ||
            createMarkerFromQuote(
                displayText,
                text,
                showFullContext ? "full" : "excerpt",
            );
        if (!marker) return null;

        return {
            text,
            marker,
        };
    }, [displayText, showFullContext]);

    const syncHighlightContext = useCallback(
        (nextSelectionText: string, nextMarker: EchoMarker | null) => {
            if (!onAskRagFromHighlight || !nextSelectionText.trim() || !nextMarker) {
                return;
            }
            const nextSyncKey = `${selectionSourceKeyRef.current}:${nextSelectionText.trim()}:${nextMarker.marker_id || nextMarker.start_offset || 0}`;
            if (selectionSyncKeyRef.current === nextSyncKey) {
                return;
            }
            selectionSyncKeyRef.current = nextSyncKey;
            onAskRagFromHighlight({
                text: nextSelectionText.trim(),
                title: customTitle || sourceLabel || "Saved Echo",
                chapter: String(chunk.chapter || "Unknown Chapter"),
                sourceLabel,
                sourceAnchorId: clusterId,
                sourceKey: selectionSourceKeyRef.current,
                selectionRefs: [
                    {
                        kind: "echo",
                        id: echoId,
                        label: customTitle || sourceLabel || "Saved Echo",
                        cluster_id: clusterId,
                        echo_id: echoId,
                    },
                ],
                contextExtras: {
                    echo_id: echoId,
                    cluster_id: clusterId,
                    book_id: clusterTitle,
                    library_id: "",
                    filename: String((chunk as any).filename || ""),
                    chunk_id: String((chunk as any).chunk_id || ""),
                    chunk_ref: String((chunk as any).chunk_ref || ""),
                    source_lid: String((chunk as any).source_lid || ""),
                    full_text: String(fullText || chunk.text || ""),
                    marker: nextMarker,
                },
            });
        },
        [
            chunk,
            clusterId,
            clusterTitle,
            customTitle,
            echoId,
            fullText,
            onAskRagFromHighlight,
            sourceLabel,
        ],
    );

    const captureSelection = useCallback(() => {
        window.setTimeout(() => {
            const payload = getSelectionPayload();
            if (!payload) return;
            setSelectionText(payload.text);
            setActiveMarker(payload.marker);
            syncHighlightContext(payload.text, payload.marker);
        }, 0);
    }, [getSelectionPayload, syncHighlightContext]);

    const clearEphemeralHighlight = useCallback(() => {
        setSelectionText("");
        setActiveMarker(null);
        setShowHighlightMenu(false);
        selectionSyncKeyRef.current = "";
        onClearHighlightRagComposer?.(selectionSourceKeyRef.current);
        window.getSelection()?.removeAllRanges();
    }, [onClearHighlightRagComposer]);

    useEffect(() => {
        if (!isExpanded) return;
        document.addEventListener("selectionchange", captureSelection);
        return () => {
            document.removeEventListener("selectionchange", captureSelection);
        };
    }, [captureSelection, isExpanded]);

    useEffect(() => {
        if (!onAskRagFromHighlight || !isExpanded) {
            return;
        }
        if (!activeSelectionText || !activeMarker) {
            return;
        }
        syncHighlightContext(activeSelectionText, activeMarker);
    }, [
        activeMarker,
        activeSelectionText,
        isExpanded,
        onAskRagFromHighlight,
        syncHighlightContext,
    ]);

    useEffect(() => {
        if (!isExpanded || !activeMarker?.quote || hasPersistentActiveMarker) {
            return;
        }

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
    }, [
        activeMarker,
        clearEphemeralHighlight,
        hasPersistentActiveMarker,
        isExpanded,
    ]);

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

        if (fullText !== String(chunk.text || "")) {
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
                setFullText(String(res.data.text));
            }
        } catch (error) {
            console.error("Failed to expand saved echo context", error);
        } finally {
            setLoadingContext(false);
            setShowFullContext(true);
        }
    };

    const runHighlightBranchSearch = async () => {
        const payload = getSelectionPayload();
        const nextSelection = payload?.text || activeSelectionText;
        if (!nextSelection || !onCreateBranchFromHighlight) return;
        await onCreateBranchFromHighlight(nextSelection);
        setShowHighlightMenu(false);
    };

    const openHighlightRag = () => {
        const payload = getSelectionPayload();
        const nextSelection = payload?.text || activeSelectionText;
        const nextMarker = payload?.marker || activeMarker;
        if (!nextSelection || !nextMarker || !onAskRagFromHighlight) return;
        setSelectionText(nextSelection);
        setActiveMarker(nextMarker);
        syncHighlightContext(nextSelection, nextMarker);
        setShowHighlightMenu(false);
    };

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

    const renderContextBody = useMemo(
        () =>
            renderMarkedText(
                displayText,
                savedMarkers,
                activeMarker,
                `saved-echo:${clusterId}:${echoId}`,
            ),
        [activeMarker, clusterId, displayText, echoId, savedMarkers],
    );

    return (
        <div
            ref={containerRef}
            data-cluster-id={clusterId}
            onClick={handleSelectionToggle}
            className={`mb-1 bg-white px-3 py-3 ${
                isSelected
                    ? "border border-black"
                    : "border-b border-slate-200"
            } ${selectionMode ? "cursor-pointer" : ""}`}
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    {isExpanded ? (
                        <input
                            type="text"
                            value={customTitle}
                            onChange={(event) => setCustomTitle(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !isSavingTitle) {
                                    event.preventDefault();
                                    handleSaveTitle();
                                }
                            }}
                            className="w-full border-none border-b border-slate-900 bg-transparent px-0 py-0 pb-1 text-[15px] font-semibold tracking-[-0.03em] text-slate-900 underline-offset-4 focus:outline-none focus:ring-0"
                        />
                    ) : (
                        <button onClick={onToggleExpand} className="w-full text-left">
                            <div className="truncate text-[13px] font-medium text-slate-700">
                                {customTitle}
                            </div>
                            {isDerivedRun ? (
                                <div className="mt-1 line-clamp-2 text-[16px] font-semibold leading-6 text-slate-900">
                                    {compactSummary || chunk.text || "No summary saved."}
                                </div>
                            ) : (
                                <div className="mt-1 text-[12px] leading-6 text-slate-700">
                                    {chunk.chapter || "Unknown Chapter"}
                                </div>
                            )}
                            <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {sourceLabel}
                            </div>
                        </button>
                    )}

                    {isExpanded && (
                        <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {chunk.chapter || "Unknown Chapter"} {sourceLabel ? `• ${sourceLabel}` : ""}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[10px] font-bold uppercase tracking-[0.16em]">
                    {isExpanded ? (
                        <>
                            <button
                                onClick={toggleFullContext}
                                title={
                                    loadingContext
                                        ? "Loading Context"
                                        : showFullContext
                                          ? "Collapse Context"
                                          : "Read Full Context"
                                }
                                aria-label={
                                    loadingContext
                                        ? "Loading Context"
                                        : showFullContext
                                          ? "Collapse Context"
                                          : "Read Full Context"
                                }
                                className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:text-slate-900"
                            >
                                <IonIcon
                                    icon={documentTextOutline}
                                    className={`h-4 w-4 ${loadingContext ? "animate-pulse" : ""}`}
                                />
                            </button>
                            <div
                                className="relative"
                                data-selection-ignore="true"
                            >
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => setShowHighlightMenu((prev) => !prev)}
                                    title="Highlight Actions"
                                    aria-label="Highlight Actions"
                                    className={`transition-colors ${
                                        activeSelectionText
                                            ? "text-slate-900 hover:text-black"
                                            : "text-slate-500 hover:text-slate-900"
                                    } inline-flex h-8 w-8 items-center justify-center`}
                                >
                                    <IonIcon icon={colorWandOutline} className="h-4 w-4" />
                                </button>
                                {showHighlightMenu && (
                                    <div className="absolute right-0 top-6 z-30 min-w-[140px] border border-slate-200 bg-white p-1 shadow-lg">
                                        <button
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={runHighlightBranchSearch}
                                            disabled={!onCreateBranchFromHighlight}
                                            className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                        >
                                            <span>Find Echoes</span>
                                        </button>
                                        <button
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={openHighlightRag}
                                            disabled={!onAskRagFromHighlight}
                                            className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                        >
                                            <span>Ask RAG</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                            {branchCount > 0 && onShowBranches && (
                                <button
                                    onClick={onShowBranches}
                                    title="Show Related Branches"
                                    aria-label="Show Related Branches"
                                    className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:text-slate-900"
                                >
                                    <IonIcon icon={gitBranchOutline} className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={() => onManageNotes(echoId)}
                                title={
                                    linkedNoteIds.length > 0
                                        ? `Linked Notes ${linkedNoteIds.length}`
                                        : "Manage Notes"
                                }
                                aria-label="Manage Notes"
                                className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:text-slate-900"
                            >
                                <IonIcon icon={chatbubbleEllipsesOutline} className="h-4 w-4" />
                            </button>
                            <button
                                onClick={handleSaveTitle}
                                disabled={isSavingTitle || !customTitle.trim()}
                                title={isSavingTitle ? "Saving" : "Save"}
                                aria-label={isSavingTitle ? "Saving" : "Save"}
                                className={`transition-colors ${
                                    isSavingTitle || !customTitle.trim()
                                        ? "text-slate-300"
                                        : "text-slate-600 hover:text-slate-900"
                                } inline-flex h-8 w-8 items-center justify-center`}
                            >
                                <IonIcon
                                    icon={bookmarkOutline}
                                    className={`h-4 w-4 ${isSavingTitle ? "animate-pulse" : ""}`}
                                />
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                title="Delete"
                                aria-label="Delete"
                                className={`transition-colors ${
                                    isDeleting
                                        ? "text-slate-300"
                                        : "text-slate-400 hover:text-red-600"
                                } inline-flex h-8 w-8 items-center justify-center`}
                            >
                                <IonIcon icon={trashOutline} className="h-4 w-4" />
                            </button>
                            <button
                                onClick={onToggleExpand}
                                className="text-slate-500 transition-colors hover:text-slate-900"
                                aria-label="Collapse saved echo"
                            >
                                <IonIcon icon={chevronUpOutline} className="h-4 w-4" />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onToggleExpand}
                            className="text-slate-400 transition-colors hover:text-slate-900"
                            aria-label="Expand saved echo"
                        >
                            <IonIcon icon={chevronDownOutline} className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="mt-4">
                    {originContext?.text ? (
                        <section className="mb-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Source Context
                            </div>
                            <div className="mt-2">
                                {originContext.title ? (
                                    <div className="text-[13px] font-semibold text-slate-900">
                                        {originContext.title}
                                    </div>
                                ) : null}
                                <div className="mt-1 whitespace-pre-wrap text-[13px] leading-7 text-slate-700">
                                    {originContext.text}
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {isDerivedRun && compactSummary ? (
                        <section className="mb-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Summary
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-[16px] font-semibold leading-8 text-slate-900">
                                {compactSummary}
                            </div>
                        </section>
                    ) : null}

                    <div
                        ref={contextRef}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseUp={captureSelection}
                        onKeyUp={captureSelection}
                        onTouchEnd={captureSelection}
                        className="no-pan max-h-[420px] overflow-y-auto font-serif text-[15px] leading-8 text-slate-800 selection:bg-[#f3dd73] selection:text-slate-900"
                        style={{ userSelect: "text", WebkitUserSelect: "text" }}
                    >
                        {loadingContext ? (
                            <div className="flex items-center gap-3 text-sm text-slate-500">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                                Stitching full context...
                            </div>
                        ) : (
                            <div className="whitespace-pre-wrap">
                                {renderContextBody}
                            </div>
                        )}
                    </div>

                    <EvidenceSection
                        title="Local Corpus"
                        items={analysisMetadata.local_evidence || []}
                    />
                    <EvidenceSection
                        title="Web Sources"
                        items={analysisMetadata.web_evidence || []}
                    />
                    {Array.isArray(analysisMetadata.follow_ups) &&
                    analysisMetadata.follow_ups.length > 0 ? (
                        <section className="mt-6">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Follow Ups
                            </div>
                            <ul className="mt-2 space-y-2 text-[13px] leading-7 text-slate-700">
                                {analysisMetadata.follow_ups.map(
                                    (item: string, index: number) => (
                                        <li key={`follow-up-${index}`}>- {item}</li>
                                    ),
                                )}
                            </ul>
                        </section>
                    ) : null}
                </div>
            )}
        </div>
    );
}
