import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
    BookOpenIcon,
    PencilSquareIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { buildApiUrl } from "../../../lib/runtimeConfig";

export default function EchoContextModal({
    echoId,
    onClose,
    onOpenNote,
}: {
    echoId: string;
    onClose: () => void;
    onOpenNote?: (note: any) => void;
}) {
    const [echo, setEcho] = useState<any>(null);
    const [loadingEcho, setLoadingEcho] = useState(true);
    const [fullContext, setFullContext] = useState("");
    const [loadingContext, setLoadingContext] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadingEcho(true);
        setEcho(null);
        setFullContext("");

        axios
            .get(buildApiUrl(`/brain/echo/${echoId}`))
            .then((res) => {
                if (!cancelled && res.data.status === "success") {
                    setEcho(res.data.data);
                }
            })
            .catch((error) => {
                console.error("Failed to load echo context", error);
            })
            .finally(() => {
                if (!cancelled) setLoadingEcho(false);
            });

        return () => {
            cancelled = true;
        };
    }, [echoId]);

    const primarySource = useMemo(() => echo?.sources?.[0] || null, [echo]);

    useEffect(() => {
        if (!primarySource?.filename || !primarySource?.original_chunk_id) {
            setFullContext(primarySource?.highlight || "");
            return;
        }

        let cancelled = false;
        setLoadingContext(true);

        axios
            .post(buildApiUrl("/echo/expand_context"), {
                filename: primarySource.filename,
                chunk_id: primarySource.original_chunk_id,
                window: 4,
            })
            .then((res) => {
                if (
                    !cancelled &&
                    res.data.status === "success" &&
                    res.data.text
                ) {
                    setFullContext(res.data.text);
                } else if (!cancelled) {
                    setFullContext(primarySource.highlight || "");
                }
            })
            .catch((error) => {
                console.error("Failed to expand echo context", error);
                if (!cancelled) {
                    setFullContext(primarySource.highlight || "");
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingContext(false);
            });

        return () => {
            cancelled = true;
        };
    }, [primarySource]);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3 sm:p-4 md:p-8 pointer-events-auto">
            <div className="flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-white/80 bg-[#f5f5f7] shadow-[0_28px_100px_-30px_rgba(15,23,42,0.48)] sm:h-[88vh] sm:rounded-[32px]">
                <div className="flex flex-col gap-4 border-b border-black/5 bg-[#fbfbfc] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:py-6">
                    <div className="min-w-0 sm:pr-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 rounded-2xl bg-white border border-black/5">
                                <BookOpenIcon className="w-5 h-5 text-slate-700" />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                                Echo Context
                            </span>
                        </div>
                        <h2 className="truncate text-[22px] font-semibold tracking-[-0.03em] text-slate-900 sm:text-[30px]">
                            {echo?.title || echo?.ai_insight || "Saved Echo"}
                        </h2>
                        <p className="mt-2 max-w-3xl line-clamp-2 text-sm text-slate-500">
                            {echo?.ai_insight ||
                                "Loading saved echo context..."}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 rounded-full text-slate-400 hover:text-red-600 hover:bg-white transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {loadingEcho ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
                        <div className="w-8 h-8 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-medium">
                            Loading echo context...
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.55fr_0.75fr]">
                        <div className="min-h-0 flex flex-col border-r border-black/5">
                            <div className="border-b border-black/5 bg-[#fbfbfc] px-4 py-4 sm:px-8">
                                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500">
                                    <span className="px-3 py-1 rounded-full bg-white border border-black/5">
                                        {primarySource?.filename ||
                                            echo?.column_name ||
                                            "Unknown Source"}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-white border border-black/5">
                                        {primarySource?.context ||
                                            "Unknown Chapter"}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto bg-[#f8f8fa] px-4 py-5 sm:px-8 sm:py-7">
                                {loadingContext ? (
                                    <div className="flex items-center gap-3 text-slate-500 text-sm">
                                        <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                                        Stitching full context...
                                    </div>
                                ) : (
                                    <div className="whitespace-pre-wrap rounded-[24px] border border-black/5 bg-white px-4 py-4 font-serif text-[15px] leading-7 text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.7)] sm:rounded-[28px] sm:px-6 sm:py-6 sm:leading-8">
                                        {fullContext ||
                                            primarySource?.highlight ||
                                            "No context available."}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="min-h-0 overflow-y-auto bg-[#f5f5f7] px-4 py-5 sm:px-6 sm:py-6">
                            <div className="mb-6">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-3">
                                    Linked Notes
                                </h3>
                                {echo?.linked_notes?.length ? (
                                    <div className="space-y-2">
                                        {echo.linked_notes.map((note: any) => (
                                            <button
                                                key={note.note_id}
                                                onClick={() =>
                                                    onOpenNote?.(note)
                                                }
                                                className="w-full text-left px-4 py-3 rounded-[22px] border border-black/5 bg-white hover:bg-[#fcfcfd] hover:border-slate-300 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <PencilSquareIcon className="w-4 h-4 text-slate-500 shrink-0" />
                                                    <span className="font-semibold text-slate-800 truncate">
                                                        {note.title ||
                                                            "Untitled Note"}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-[22px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                                        No linked notes yet.
                                    </div>
                                )}
                            </div>

                            <div className="rounded-[22px] border border-black/5 bg-white px-4 py-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 mb-2">
                                    Source Highlight
                                </p>
                                <p className="text-sm leading-6 text-slate-700 italic">
                                    "
                                    {primarySource?.highlight ||
                                        "No saved highlight available."}
                                    "
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
