import React from "react";
import {
    BookmarkSquareIcon,
    GlobeAltIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import DraggableColumn from "./DraggableColumn";

function EvidenceBlock({
    title,
    items,
    emptyMessage,
}: {
    title: string;
    items: any[];
    emptyMessage: string;
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
                        <article
                            key={`${title}-${item.id || index}`}
                            className="border border-slate-200 bg-white px-4 py-4 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-900">
                                        {item.title || "Untitled Evidence"}
                                    </h4>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        {item.chapter ? <span>{item.chapter}</span> : null}
                                        {item.author ? <span>{item.author}</span> : null}
                                        {item.similarity ? (
                                            <span>{item.similarity}%</span>
                                        ) : null}
                                    </div>
                                </div>
                                {item.url ? (
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-900"
                                    >
                                        Source
                                    </a>
                                ) : null}
                            </div>
                            <p className="mt-3 whitespace-pre-wrap font-serif text-[14px] leading-7 text-slate-800">
                                {item.text}
                            </p>
                        </article>
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
                            />

                            <EvidenceBlock
                                title="Local Corpus"
                                items={derived.localEvidence || []}
                                emptyMessage="No local evidence was returned."
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
