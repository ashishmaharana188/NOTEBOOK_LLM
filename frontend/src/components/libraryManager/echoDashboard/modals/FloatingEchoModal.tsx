import React, { useState, useEffect } from "react";
import axios from "axios";
import { XMarkIcon } from "@heroicons/react/24/outline";
import DraggableColumn from "../components/DraggableColumn";
import InteractiveChunkCard from "../components/InteractiveChunkCard";
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

    const mockChunk: any = {
        text: echo.sources?.[0]?.highlight || "",
        filename: echo.sources?.[0]?.filename || "Unknown",
        chapter: echo.sources?.[0]?.context || "Unknown Chapter",
        bridge: echo.ai_insight,
        relation: "Saved Insight",
        similarity: 100,
        echo_id: echo.echo_id,
        linked_note_id: echo.linked_note_id,
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 pointer-events-auto font-sans p-4">
            <div className="relative w-[400px] h-fit max-h-[80vh]">
                <DraggableColumn
                    id="peek-modal"
                    title={echo.column_name || "Saved Cluster"}
                    author="Source Workspace"
                    initialPos={{ x: 0, y: 0 }}
                    onDragEnd={() => {}}
                    zIndex={100}
                    bringToFront={() => {}}
                    scale={1}
                >
                    <div className="p-4 space-y-4 bg-canvas/50 min-h-full">
                        <InteractiveChunkCard
                            chunk={mockChunk}
                            chunkIndex={0}
                            query=""
                            activeBookTitle={
                                echo.column_name || "Saved Cluster"
                            }
                            onNoteClick={() => {}} // Disabled in peek mode
                            onManageNotes={() => {}} // Disabled in peek mode
                            linkedNoteIds={[]}
                        />
                    </div>
                </DraggableColumn>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-[110] p-1 bg-surface/50 hover:bg-red-50 text-muted hover:text-red-500 rounded-sm transition-colors"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
