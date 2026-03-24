import React, { useState } from "react";
import axios from "axios";
import {
    PlusIcon,
    XMarkIcon,
    DocumentTextIcon,
} from "@heroicons/react/24/outline";

const CARD_SIZES = ["A3", "A4", "A5", "A6", "A7"];

export function ManualCardCreator({
    targetId,
    rootId,
    targetLayout = [],
    canvasMode,
    onSuccess,
}: any) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedSize, setSelectedSize] = useState("A5");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSpawn = async () => {
        if (!targetId) return;
        setIsSubmitting(true);
        try {
            const isGroupTarget =
                String(targetId).startsWith("grp_") ||
                String(targetId).startsWith("arch_fld_");
            const isClusterTarget = String(targetId).startsWith("cluster_");
            const noteGroupId = isGroupTarget ? targetId : null;
            const layoutClusterId =
                canvasMode === "ECHO"
                    ? rootId || (isClusterTarget ? targetId : null)
                    : null;
            const shouldInjectToEchoLayout =
                canvasMode === "ECHO" && !!layoutClusterId && !isGroupTarget;

            if (canvasMode === "NOTES" && !isGroupTarget) {
                setIsSubmitting(false);
                return;
            }

            const baseTags = [`size:${selectedSize}`, "manual_injected:1"];
            if (canvasMode === "ECHO") baseTags.push("manual_canvas:1");

            // 1. Save a blank placeholder note to the database
            const noteRes = await axios.post(
                "https://doomprompting123-space.hf.space/notes/item/create",
                {
                    group_id: noteGroupId,
                    title: "Untitled Note", // Default placeholder title
                    content: "", // Blank content
                    tags: baseTags.join(", "), // Inject size and explicit canvas placement marker
                    linked_echo_id: null,
                },
            );

            if (noteRes.data.status === "success") {
                const newNoteId = noteRes.data.note_id;
                const newLayout = [
                    ...targetLayout,
                    { type: "note", id: newNoteId },
                ];

                // 2. Inject pointer into the Master Binder (Echo Mode)
                if (shouldInjectToEchoLayout) {
                    await axios.put(
                        "https://doomprompting123-space.hf.space/brain/cluster/layout",
                        {
                            cluster_id: layoutClusterId,
                            orbit_layout: newLayout,
                        },
                    );
                }

                // 3. Reset UI and Refresh Canvas
                setIsOpen(false);
                if (onSuccess) onSuccess();
            }
        } catch (err) {
            console.error("Failed to spawn card:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative flex items-center border-l border-slate-700/50 pl-4 ml-2">
            {isOpen && (
                <div
                    onWheel={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute bottom-[130%] right-0 mb-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl p-5 w-[320px] z-[999999]"
                >
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/50">
                        <h3 className="text-sm font-extrabold tracking-widest uppercase text-slate-200 flex items-center gap-2">
                            <DocumentTextIcon className="w-5 h-5 text-blue-400" />
                            Spawn Blank Note
                        </h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                            Card Dimension
                        </label>
                        <div className="flex gap-2">
                            {CARD_SIZES.map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setSelectedSize(size)}
                                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                                        selectedSize === size
                                            ? "bg-blue-500 text-white"
                                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleSpawn}
                            disabled={
                                isSubmitting ||
                                !targetId ||
                                (canvasMode === "NOTES" &&
                                    !String(targetId).startsWith("grp_") &&
                                    !String(targetId).startsWith("arch_fld_"))
                            }
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting
                                ? "Injecting..."
                                : targetId &&
                                    (canvasMode === "ECHO" ||
                                        String(targetId).startsWith("grp_") ||
                                        String(targetId).startsWith(
                                            "arch_fld_",
                                        ))
                                  ? "Inject into Orbit"
                                  : "Open a folder first"}
                        </button>
                    </div>
                </div>
            )}

            {/* TOOLBAR TRIGGER BUTTON */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={
                    !targetId ||
                    (canvasMode === "NOTES" &&
                        !String(targetId).startsWith("grp_") &&
                        !String(targetId).startsWith("arch_fld_"))
                }
                className={`flex items-center justify-center p-1.5 rounded-full transition-all ${
                    isOpen
                        ? "bg-blue-500 text-white"
                        : "text-slate-400 hover:text-white hover:bg-white/10"
                } ${
                    !targetId ||
                    (canvasMode === "NOTES" &&
                        !String(targetId).startsWith("grp_") &&
                        !String(targetId).startsWith("arch_fld_"))
                        ? "opacity-30 cursor-not-allowed"
                        : ""
                }`}
                title={
                    targetId &&
                    (canvasMode === "ECHO" ||
                        String(targetId).startsWith("grp_") ||
                        String(targetId).startsWith("arch_fld_"))
                        ? "Spawn Blank Note"
                        : "Open a folder first"
                }
            >
                <PlusIcon className="w-5 h-5" />
            </button>
        </div>
    );
}
