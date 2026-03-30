import React, { useState } from "react";
import axios from "axios";
import type { EchoChunk } from "../echoTypes";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

export default function ExpandableChunkCard({ chunk }: { chunk: EchoChunk }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [fullText, setFullText] = useState(
        String((chunk as any).full_text || chunk.text || ""),
    );
    const [loadingContext, setLoadingContext] = useState(false);

    const handleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isExpanded) {
            setIsExpanded(false);
            return;
        }
        if (fullText !== chunk.text) {
            setIsExpanded(true);
            return;
        }

        const chunkId = String((chunk as any).chunk_id || "");
        const filename = String((chunk as any).filename || "");

        if (!filename || !chunkId) {
            setIsExpanded(true);
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
                (chunk as any).full_text = String(res.data.text);
            }
        } catch (error) {
            console.error("Failed to stitch context", error);
        } finally {
            setLoadingContext(false);
            setIsExpanded(true);
        }
    };

    return (
        <div className="mt-4">
            <button
                onClick={handleExpand}
                className="px-0 py-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-900"
            >
                {loadingContext
                    ? "Stitching Context..."
                    : isExpanded
                      ? "Collapse Context"
                      : "Read Full Context"}
            </button>

            {isExpanded && (
                <div className="mt-3 overflow-hidden bg-white px-0 py-0">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {chunk.chapter || "Unknown Chapter"}
                    </div>
                    <div
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="no-pan max-h-[280px] overflow-y-auto whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800 custom-scrollbar select-text cursor-text selection:bg-[#f3dd73] selection:text-slate-900"
                        style={{ userSelect: "text", WebkitUserSelect: "text" }}
                    >
                        {fullText}
                    </div>
                </div>
            )}
        </div>
    );
}
