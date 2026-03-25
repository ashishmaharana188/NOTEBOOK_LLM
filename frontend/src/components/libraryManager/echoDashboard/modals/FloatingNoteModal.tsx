import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
    PencilSquareIcon,
    PlusIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

export default function FloatingNoteModal({
    echoId,
    onClose,
    onEdit,
    onAdd,
}: {
    echoId: string;
    onClose: () => void;
    onEdit: (note: any) => void;
    onAdd: (echoData: {
        markdown: string;
        title: string;
        echoId: string;
    }) => void;
}) {
    const [echo, setEcho] = useState<any>(null);

    useEffect(() => {
        let cancelled = false;
        axios
            .get(buildApiUrl(`/brain/echo/${echoId}`))
            .then((res) => {
                if (!cancelled && res.data.status === "success") {
                    setEcho(res.data.data);
                }
            })
            .catch((error) => {
                console.error("Failed to load linked notes", error);
            });

        return () => {
            cancelled = true;
        };
    }, [echoId]);

    const primarySource = useMemo(() => echo?.sources?.[0] || {}, [echo]);

    const handleAddLinkedNote = () => {
        const bridge = echo?.ai_insight || echo?.title || "AI Insight";
        const generatedTitle =
            bridge.length > 40 ? `${bridge.substring(0, 40)}...` : bridge;
        const filename =
            primarySource.filename || echo?.column_name || "Unknown";
        const chapter = primarySource.context
            ? ` (${primarySource.context})`
            : "";
        const markdown = `> **${bridge}**\n> ${primarySource.highlight || ""}\n>\n> *Source: ${filename}${chapter}*\n\n`;
        onAdd({
            markdown,
            title: generatedTitle,
            echoId,
        });
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 pointer-events-auto p-3 sm:p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/80 bg-[#f5f5f7] shadow-[0_24px_90px_-26px_rgba(15,23,42,0.42)] sm:rounded-[32px]">
                <div className="flex flex-col gap-4 border-b border-black/5 bg-[#fbfbfc] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-7 sm:py-6">
                    <div className="min-w-0 sm:pr-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mb-2">
                            Linked Notes
                        </p>
                        <h3 className="truncate text-[22px] font-semibold tracking-[-0.03em] text-slate-900 sm:text-[28px]">
                            {echo?.title || echo?.ai_insight || "Saved Echo"}
                        </h3>
                        <p className="text-sm text-slate-500 mt-2">
                            Add another linked note or open an existing one for
                            editing.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 text-slate-400 hover:text-red-600 hover:bg-white rounded-full transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="bg-[#f5f5f7] p-4 sm:p-7">
                    <button
                        onClick={handleAddLinkedNote}
                        disabled={!echo}
                        className="w-full mb-5 px-5 py-4 rounded-[22px] bg-slate-900 hover:bg-black text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    >
                        <PlusIcon className="w-4 h-4" /> Add Linked Note
                    </button>

                    <div className="custom-scrollbar max-h-[min(60vh,420px)] space-y-3 overflow-y-auto">
                        {!echo ? (
                            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/85 px-4 py-6 text-center text-sm text-slate-500">
                                Loading linked notes...
                            </div>
                        ) : echo.linked_notes?.length ? (
                            echo.linked_notes.map((note: any) => (
                                <button
                                    key={note.note_id}
                                    onClick={() => onEdit(note)}
                                    className="w-full text-left px-5 py-4 rounded-[24px] border border-black/5 bg-white hover:bg-[#fcfcfd] hover:border-slate-300 transition-colors flex items-center gap-3 shadow-[0_1px_0_rgba(255,255,255,0.7)]"
                                >
                                    <PencilSquareIcon className="w-4 h-4 text-slate-500 shrink-0" />
                                    <span className="font-semibold text-slate-800 truncate text-[15px]">
                                        {note.title || "Untitled Note"}
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/85 px-4 py-8 text-center text-sm text-slate-500">
                                No linked notes yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
