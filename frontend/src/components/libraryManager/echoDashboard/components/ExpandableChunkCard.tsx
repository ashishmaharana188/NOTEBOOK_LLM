import React, { useState } from "react";
import axios from "axios";
import { BookOpenIcon } from "@heroicons/react/24/outline";
import type { EchoChunk } from "../echoTypes";
import { API_BASE_URL } from "../../../../lib/runtimeConfig";

export default function ExpandableChunkCard({ chunk }: { chunk: EchoChunk }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [fullText, setFullText] = useState(chunk.text);
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

        const chunkId = (chunk as any).chunk_id;
        const filename = (chunk as any).filename;

        if (!filename || !chunkId) {
            setIsExpanded(true);
            return;
        }

        setLoadingContext(true);
        try {
            const API = axios.create({
                baseURL: API_BASE_URL,
            });
            const res = await API.post("/echo/expand_context", {
                filename: filename,
                chunk_id: chunkId,
                window: 4,
            });
            if (res.data.status === "success" && res.data.text) {
                setFullText(res.data.text);
            }
        } catch (error) {
            console.error("Failed to stitch context", error);
        } finally {
            setLoadingContext(false);
            setIsExpanded(true);
        }
    };

    return (
        <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                    <BookOpenIcon className="w-3 h-3" /> Context View
                </span>
                <span className="text-[9px] font-mono text-muted truncate max-w-[150px] text-right">
                    {chunk.chapter || "Unknown Chapter"}
                </span>
            </div>
            <div
                className={`bg-canvas border border-slate-100 rounded-sm p-3 transition-all duration-300 ${
                    isExpanded
                        ? "max-h-[30vh] overflow-y-auto custom-scrollbar"
                        : ""
                }`}
            >
                {isExpanded ? (
                    <div className="text-sm text-primary leading-relaxed font-serif whitespace-pre-wrap">
                        {fullText}
                    </div>
                ) : (
                    <p className="text-xs text-slate-600 leading-relaxed italic line-clamp-4">
                        "{chunk.text}"
                    </p>
                )}
            </div>
            <button
                onClick={handleExpand}
                className="mt-3 text-[9px] font-bold text-muted hover:text-primary uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
                {loadingContext ? (
                    <span className="animate-pulse flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full border border-slate-500 border-t-transparent animate-spin"></div>
                        Stitching Pages...
                    </span>
                ) : isExpanded ? (
                    "Collapse Context"
                ) : (
                    "Read Full Context"
                )}
            </button>
        </div>
    );
}
