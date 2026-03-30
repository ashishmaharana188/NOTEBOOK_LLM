import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    BookmarkSquareIcon,
    GlobeAltIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import DraggableColumn from "./DraggableColumn";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

function DerivedEvidenceCard({
    derived,
    item,
    itemKey,
    onCreateBranchFromHighlight,
    onAskRagFromHighlight,
}: {
    derived: any;
    item: any;
    itemKey: string;
    onCreateBranchFromHighlight?: (payload: {
        text: string;
        derived: any;
        item: any;
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
}) {
    const [selectionText, setSelectionText] = useState("");
    const [showHighlightMenu, setShowHighlightMenu] = useState(false);
    const [showFullContext, setShowFullContext] = useState(false);
    const [loadingContext, setLoadingContext] = useState(false);
    const [fullText, setFullText] = useState(
        String(item.full_text || item.text || ""),
    );
    const contextRef = useRef<HTMLDivElement | null>(null);

    const sourceLabel = useMemo(
        () =>
            String(item.author || item.source_label || item.source_kind || "").trim() ||
            String(derived.modeLabel || "Derived Evidence"),
        [derived.modeLabel, item.author, item.source_kind, item.source_label],
    );
    const chapterLabel = useMemo(
        () =>
            String(item.chapter || item.section || "").trim() ||
            String(derived.modeLabel || "Derived Evidence"),
        [derived.modeLabel, item.chapter, item.section],
    );
    const sourceAnchorId = useMemo(
        () =>
            String(
                item.cluster_id ||
                    derived.sourceAnchorIds?.[0] ||
                    derived.id ||
                    "",
            ),
        [derived.id, derived.sourceAnchorIds, item.cluster_id],
    );
    const hasExpandableContext = useMemo(
        () =>
            Boolean(
                (item.filename && item.chunk_id) ||
                    (item.full_text && String(item.full_text) !== String(item.text)),
            ),
        [item.chunk_id, item.filename, item.full_text, item.text],
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

    const captureSelection = useCallback(() => {
        window.setTimeout(() => {
            setSelectionText(getSelectionWithinContext());
        }, 0);
    }, [getSelectionWithinContext]);

    useEffect(() => {
        document.addEventListener("selectionchange", captureSelection);
        return () => {
            document.removeEventListener("selectionchange", captureSelection);
        };
    }, [captureSelection]);

    useEffect(() => {
        setFullText(String(item.full_text || item.text || ""));
        setShowFullContext(false);
        setSelectionText("");
        setShowHighlightMenu(false);
    }, [item.full_text, item.text, itemKey]);

    const toggleFullContext = async () => {
        if (showFullContext) {
            setShowFullContext(false);
            return;
        }

        const preferredFullText = String(item.full_text || "").trim();
        if (preferredFullText && preferredFullText !== String(item.text || "")) {
            setFullText(preferredFullText);
            setShowFullContext(true);
            return;
        }

        const chunkId = String(item.chunk_id || "");
        const filename = String(item.filename || "");
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
            console.error("Failed to expand derived evidence context", error);
        } finally {
            setLoadingContext(false);
            setShowFullContext(true);
        }
    };

    const handleSearchHighlight = async () => {
        const nextSelection = selectionText || getSelectionWithinContext();
        if (!nextSelection || !onCreateBranchFromHighlight) return;
        await onCreateBranchFromHighlight({
            text: nextSelection,
            derived,
            item,
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
            title: String(item.title || derived.title || "Derived Evidence"),
            chapter: chapterLabel,
            sourceLabel,
            sourceAnchorId,
            selectionRefs: [
                {
                    kind: "derived_evidence",
                    id: String(item.id || itemKey),
                    label: String(item.title || derived.title || "Derived Evidence"),
                    cluster_id: String(item.cluster_id || ""),
                    echo_id: String(item.echo_id || derived.sourceEchoIds?.[0] || ""),
                },
            ],
            contextExtras: {
                echo_id: String(item.echo_id || derived.sourceEchoIds?.[0] || ""),
                cluster_id: String(item.cluster_id || ""),
                book_id: String(item.book_id || derived.title || ""),
                library_id: String(item.library_id || ""),
                filename: String(item.filename || ""),
                chunk_id: String(item.chunk_id || ""),
                chunk_ref: String(item.chunk_ref || ""),
                source_lid: String(item.source_lid || ""),
                full_text: String(item.full_text || item.text || ""),
            },
        });
        setShowHighlightMenu(false);
        setSelectionText("");
        window.getSelection()?.removeAllRanges();
    };

    return (
        <article className="border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-900">
                        {item.title || "Untitled Evidence"}
                    </h4>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {chapterLabel ? <span>{chapterLabel}</span> : null}
                        {sourceLabel ? <span>{sourceLabel}</span> : null}
                        {item.similarity ? <span>{item.similarity}%</span> : null}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em]">
                    {hasExpandableContext ? (
                        <button
                            onClick={toggleFullContext}
                            className="text-slate-600 transition-colors hover:text-slate-900"
                        >
                            {loadingContext
                                ? "Loading"
                                : showFullContext
                                  ? "Collapse Context"
                                  : "Read Full Context"}
                        </button>
                    ) : null}
                    <div className="relative">
                        <button
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setShowHighlightMenu((prev) => !prev)}
                            className={`transition-colors ${
                                selectionText
                                    ? "text-slate-900 hover:text-black"
                                    : "text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            Highlight
                        </button>
                        {showHighlightMenu && (
                            <div className="absolute right-0 top-6 z-30 min-w-[140px] border border-slate-200 bg-white p-1 shadow-lg">
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={handleSearchHighlight}
                                    disabled={!onCreateBranchFromHighlight}
                                    className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <span>Find Echoes</span>
                                </button>
                                <button
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={handleAskRag}
                                    disabled={!onAskRagFromHighlight}
                                    className="flex w-full items-center justify-between px-2 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                                >
                                    <span>Ask RAG</span>
                                </button>
                            </div>
                        )}
                    </div>
                    {item.url ? (
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-600 transition-colors hover:text-slate-900"
                        >
                            Source
                        </a>
                    ) : null}
                </div>
            </div>

            <div
                ref={contextRef}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
                onTouchEnd={captureSelection}
                className="mt-3 max-h-[320px] overflow-y-auto whitespace-pre-wrap font-serif text-[14px] leading-7 text-slate-800 custom-scrollbar select-text"
            >
                {loadingContext ? (
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                        Stitching full context...
                    </div>
                ) : (
                    showFullContext ? fullText : item.text
                )}
            </div>
        </article>
    );
}

function EvidenceBlock({
    title,
    items,
    emptyMessage,
    derived,
    onCreateBranchFromHighlight,
    onAskRagFromHighlight,
}: {
    title: string;
    items: any[];
    emptyMessage: string;
    derived: any;
    onCreateBranchFromHighlight?: (payload: {
        text: string;
        derived: any;
        item: any;
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
}) {
    return (
        <section className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {title}
            </div>
            {items.length === 0 ? (
                <div className="border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                    {emptyMessage}
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item: any, index: number) => (
                        <DerivedEvidenceCard
                            key={`${title}-${item.id || index}`}
                            derived={derived}
                            item={item}
                            itemKey={`${title}-${item.id || index}`}
                            {...(onCreateBranchFromHighlight
                                ? {
                                      onCreateBranchFromHighlight,
                                  }
                                : {})}
                            {...(onAskRagFromHighlight
                                ? {
                                      onAskRagFromHighlight,
                                  }
                                : {})}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

export default function DerivedAnalysisColumn({
    derived,
    initialPos,
    zIndex,
    updatePosition,
    bringToFront,
    canvasScale,
    setIsCanvasWheelDisabled,
    interactionReduced,
    closeDerivedColumn,
    saveDerivedColumn,
    selectionMode,
    isSelected,
    onToggleSelect,
    onCreateBranchFromHighlight,
    onAskRagFromHighlight,
}: any) {
    return (
        <DraggableColumn
            id={derived.id}
            title={derived.title || "Derived Analysis"}
            author={derived.modeLabel || "Derived Analysis"}
            initialPos={initialPos}
            zIndex={zIndex}
            onDragEnd={updatePosition}
            bringToFront={bringToFront}
            scale={canvasScale}
            disableScroll={true}
            setIsCanvasWheelDisabled={setIsCanvasWheelDisabled}
            interactionReduced={interactionReduced}
            onDelete={() => closeDerivedColumn(derived.id)}
            defaultWidth={560}
            defaultHeight={780}
            selectionMode={selectionMode}
            isSelected={isSelected}
            onToggleSelect={onToggleSelect}
        >
            <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {derived.modeLabel || "Derived Analysis"}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em]">
                            <button
                                onClick={() => saveDerivedColumn(derived.id)}
                                disabled={derived.isLoading || !derived.summary}
                                className="inline-flex items-center gap-1 text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-40"
                            >
                                <BookmarkSquareIcon className="h-4 w-4" />
                                Save
                            </button>
                        </div>
                    </div>
                    {derived.prompt ? (
                        <p className="mt-3 font-serif text-[15px] leading-7 text-slate-800">
                            {derived.prompt}
                        </p>
                    ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 custom-scrollbar">
                    {derived.isLoading ? (
                        <div className="flex items-center gap-3 px-1 py-6 text-sm text-slate-500">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                            Building derived analysis...
                        </div>
                    ) : derived.errorMessage ? (
                        <div className="border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                            {derived.errorMessage}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <section className="border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    <SparklesIcon className="h-4 w-4" />
                                    Summary
                                </div>
                                <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-8 text-slate-800">
                                    {derived.summary || "No synthesis available."}
                                </p>
                                {Array.isArray(derived.bullets) &&
                                derived.bullets.length > 0 ? (
                                    <ul className="mt-4 space-y-2 text-sm text-slate-700">
                                        {derived.bullets.map(
                                            (item: string, index: number) => (
                                                <li
                                                    key={`bullet-${index}`}
                                                    className="leading-7"
                                                >
                                                    - {item}
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                ) : null}
                            </section>

                            <EvidenceBlock
                                title="Working Context"
                                items={derived.contexts || []}
                                emptyMessage="No explicit context was attached to this run."
                                derived={derived}
                                onCreateBranchFromHighlight={onCreateBranchFromHighlight}
                                onAskRagFromHighlight={onAskRagFromHighlight}
                            />

                            <EvidenceBlock
                                title="Local Corpus"
                                items={derived.localEvidence || []}
                                emptyMessage="No local evidence was returned."
                                derived={derived}
                                onCreateBranchFromHighlight={onCreateBranchFromHighlight}
                                onAskRagFromHighlight={onAskRagFromHighlight}
                            />

                            <section className="space-y-3">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    <GlobeAltIcon className="h-4 w-4" />
                                    Web Sources
                                </div>
                                <div className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                    {derived.webMessage ||
                                        "No web evidence was returned for this run."}
                                </div>
                                <EvidenceBlock
                                    title="Web Evidence"
                                    items={derived.webEvidence || []}
                                    emptyMessage="No web evidence was returned."
                                    derived={derived}
                                    onCreateBranchFromHighlight={onCreateBranchFromHighlight}
                                    onAskRagFromHighlight={onAskRagFromHighlight}
                                />
                            </section>

                            {Array.isArray(derived.followUps) &&
                            derived.followUps.length > 0 ? (
                                <section className="border border-slate-200 bg-white px-4 py-4 shadow-sm">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                        Follow Ups
                                    </div>
                                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                        {derived.followUps.map(
                                            (item: string, index: number) => (
                                                <li
                                                    key={`follow-up-${index}`}
                                                    className="leading-7"
                                                >
                                                    - {item}
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </section>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </DraggableColumn>
    );
}
