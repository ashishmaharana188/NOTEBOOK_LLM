import React, { useState, useEffect } from "react";
import axios from "axios";
import {
    BookOpenIcon,
    XMarkIcon,
    SparklesIcon,
    ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

export default function FloatingEchoModal({
    echoId,
    onClose,
}: {
    echoId: string;
    onClose: () => void;
}) {
    const [echo, setEcho] = useState<any>(null);

    useEffect(() => {
        axios
            .get(buildApiUrl(`/brain/echo/${echoId}`))
            .then((res) => {
                if (res.data.status === "success") setEcho(res.data.data);
            });
    }, [echoId]);

    if (!echo) return null;

    // We only show the primary echo, ignoring the rest of the compound sources
    const primarySource = echo.sources?.[0] || {};

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 pointer-events-auto font-sans p-4">
            {/* 1:1 DRAGGABLE COLUMN WRAPPER DESIGN */}
            <div className="bg-surface/95   rounded-sm border border-border-subtle shadow-xl w-[400px] flex flex-col max-h-[750px] animate-in zoom-in-95 overflow-hidden">
                {/* 1:1 COLUMN HEADER */}
                <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-canvas hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3 w-full pr-4">
                        <div className="p-2 bg-surface rounded-sm shadow-sm border border-border-subtle">
                            <BookOpenIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="overflow-hidden">
                            <h3 className="text-sm font-bold text-primary font-sans tracking-tight leading-none truncate max-w-[260px]">
                                {echo.column_name || "Saved Cluster"}
                            </h3>
                            <p className="text-[9px] font-mono font-bold text-muted mt-1.5 uppercase tracking-widest truncate">
                                Source Workspace
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted hover:text-red-500 transition-colors p-1"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* 1:1 COLUMN CONTENT AREA */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-canvas/50">
                    {/* 1:1 SINGLE CHUNK CARD DESIGN */}
                    <div className="bg-surface border border-border-subtle shadow-sm rounded-sm flex flex-col group hover:border-slate-300 transition-colors">
                        <div className="px-4 py-2 border-b border-slate-100 bg-canvas flex justify-between items-center">
                            <span className="text-[9px] font-bold text-muted uppercase tracking-widest truncate max-w-[200px]">
                                Source: {primarySource.filename || "Unknown"}
                            </span>
                            <span className="text-[9px] font-mono text-muted flex items-center gap-1">
                                <SparklesIcon className="w-3 h-3 text-purple-600" />{" "}
                                Linked Echo
                            </span>
                        </div>

                        <div className="p-4">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">
                                Saved Insight
                            </p>
                            <h5 className="font-bold text-primary text-sm leading-snug font-sans mb-3">
                                {echo.ai_insight}
                            </h5>

                            <div className="mt-4 border-t border-slate-100 pt-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[9px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                        <BookOpenIcon className="w-3 h-3" />{" "}
                                        Context View
                                    </span>
                                    <span className="text-[9px] font-mono text-muted truncate max-w-[150px] text-right">
                                        {primarySource.context ||
                                            "Unknown Chapter"}
                                    </span>
                                </div>
                                <div className="bg-canvas border border-slate-100 rounded-sm p-3">
                                    <p className="text-xs text-slate-600 leading-relaxed italic line-clamp-4">
                                        "{primarySource.highlight}"
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-canvas/80">
                            <span className="text-[9px] font-bold text-muted uppercase tracking-widest flex items-center gap-1">
                                <ViewfinderCircleIcon className="w-3 h-3" />{" "}
                                Preview Mode
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
