import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

// --- BLOCKNOTE IMPORTS ---
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import {
    extractStickiesFromTags,
    stripStickyDataFromTags,
} from "../spatialCanvas/utils/stickyData";
import { buildApiUrl } from "../../../lib/runtimeConfig";

export default function NotesFormUI({
    groupId,
    initialNote,
    prefillContent = "",
    prefillTitle = "",
    onTextSelection,
    onClose,
    onSave,
    stacks = [],
    groups = [],
}: any) {
    const [title, setTitle] = useState(
        initialNote?.title || prefillTitle || "",
    );
    const [tags, setTags] = useState("");
    const existingStickiesRef = useRef<any[]>([]);
    const systemTagsRef = useRef<string[]>([]);

    const localNoteId = useRef(initialNote?.note_id || "drafts");
    const sizeTagRef = useRef<string>("");

    // 1. Reliably extract the existing folder ID
    const [selectedGroupId, setSelectedGroupId] = useState(
        initialNote?.group_id || groupId || "",
    );
    const editorSurfaceRef = useRef<HTMLDivElement | null>(null);

    // 2. Identify the true Stack and Folder objects for the breadcrumbs
    const currentGroup = groups.find(
        (g: any) => String(g.group_id) === String(selectedGroupId),
    );
    const currentStack = stacks.find(
        (s: any) => String(s.stack_id) === String(currentGroup?.stack_id),
    );

    const [showFilingModal, setShowFilingModal] = useState(false);
    const [filingStackId, setFilingStackId] = useState("");
    const [filingGroupId, setFilingGroupId] = useState("");

    useEffect(() => {
        setTitle(initialNote?.title || prefillTitle || "");
    }, [initialNote?.title, prefillTitle]);

    useEffect(() => {
        if (!onTextSelection) return;

        const captureSelection = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !editorSurfaceRef.current) {
                return;
            }
            const text = selection.toString().trim();
            if (text.length <= 5) return;

            const anchorNode = selection.anchorNode;
            const focusNode = selection.focusNode;
            const editorRoot = editorSurfaceRef.current;
            const anchorInside = !!anchorNode && editorRoot.contains(anchorNode);
            const focusInside = !!focusNode && editorRoot.contains(focusNode);
            if (!anchorInside || !focusInside) return;

            onTextSelection(text);
        };

        document.addEventListener("selectionchange", captureSelection);
        return () => {
            document.removeEventListener("selectionchange", captureSelection);
        };
    }, [onTextSelection]);

    // 3. Pre-fill the modal if the note already has a location
    useEffect(() => {
        if (showFilingModal && currentGroup && currentStack) {
            setFilingStackId(currentStack.stack_id);
            setFilingGroupId(currentGroup.group_id);
        } else if (showFilingModal) {
            setFilingStackId("");
            setFilingGroupId("");
        }
    }, [showFilingModal, currentGroup, currentStack]);

    const uploadFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
            buildApiUrl(`/upload/media/note/${localNoteId.current}`),
            {
                method: "POST",
                body: formData,
            },
        );

        const data = await response.json();
        return data.url;
    };

    const editor = useCreateBlockNote({
        uploadFile,
    });

    // Safely load old Markdown OR new HTML
    useEffect(() => {
        async function loadContent() {
            const contentToLoad = initialNote?.content || prefillContent;
            if (contentToLoad) {
                let blocks;
                const contentStr = String(contentToLoad).trim();

                if (contentStr.startsWith("<")) {
                    blocks = await editor.tryParseHTMLToBlocks(contentStr);
                } else {
                    blocks = await editor.tryParseMarkdownToBlocks(contentStr);
                }

                editor.replaceBlocks(editor.document, blocks);
            }
        }
        loadContent();
    }, [initialNote, prefillContent, editor]);

    // Extract stickies and size tag
    useEffect(() => {
        const rawTags = initialNote?.tags || "";
        const parsedStickies = extractStickiesFromTags(rawTags);
        let legacyTags: string[] = [];
        let standardTagsStr = stripStickyDataFromTags(rawTags);
        existingStickiesRef.current = parsedStickies;

        const isSystemCanvasTag = (tag: string) =>
            tag === "manual_injected:1" || tag === "manual_canvas:1";

        const sizeMatch = standardTagsStr.match(/(size:A[3-7])/);
        if (sizeMatch) {
            sizeTagRef.current = sizeMatch[0];
            standardTagsStr = standardTagsStr.replace(sizeMatch[0], "");
        } else {
            sizeTagRef.current = "";
        }

        legacyTags = standardTagsStr
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

        systemTagsRef.current = legacyTags.filter(isSystemCanvasTag);
        const visibleLegacyTags = legacyTags.filter(
            (tag) => !isSystemCanvasTag(tag),
        );

        const stickyTexts = parsedStickies
            .map((s: any) => s.text)
            .filter(Boolean);
        const allTexts = [...visibleLegacyTags, ...stickyTexts];

        setTags(allTexts.join(", "));
    }, [initialNote]);

    const executeSave = async (finalGroupId: string) => {
        if (!editor) return;

        const contentHTML = await editor.blocksToHTMLLossy(editor.document);
        const currentTagStrings = tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

        const corners = [
            "top-[-20px] left-[-20px] -rotate-6 bg-pink-100 border-pink-200 text-pink-900",
            "top-[-20px] right-[-20px] rotate-6 bg-yellow-100 border-yellow-200 text-yellow-900",
            "bottom-[-20px] left-[-20px] -rotate-12 bg-sky-100 border-sky-200 text-sky-900",
            "bottom-[-20px] right-[-20px] rotate-12 bg-emerald-100 border-emerald-200 text-emerald-900",
        ];

        const finalStickies = currentTagStrings.map((tagText, index) => {
            const existing = existingStickiesRef.current.find(
                (s: any) => s.text === tagText,
            );
            if (existing) return existing;

            return {
                id: Date.now() + index,
                text: tagText,
                styleClass: corners[index % corners.length],
            };
        });

        const preservedPrefixTags = [...systemTagsRef.current];
        if (sizeTagRef.current) {
            preservedPrefixTags.unshift(sizeTagRef.current);
        }

        let finalTags = preservedPrefixTags.join(", ");
        if (finalStickies.length > 0) {
            finalTags = finalTags
                ? `${finalTags}, sticky_data:${JSON.stringify(finalStickies)}`
                : `sticky_data:${JSON.stringify(finalStickies)}`;
        }

        onSave(
            title,
            contentHTML,
            finalTags,
            initialNote?.note_id,
            finalGroupId,
        );
    };

    const handleMainSaveClick = () => {
        // Check if the IDs are present and valid. If YES, save immediately.
        if (currentStack && currentGroup) {
            executeSave(selectedGroupId);
        } else {
            // If unfiled, pop the modal to select a folder.
            setShowFilingModal(true);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 pointer-events-auto p-4 md:p-6 font-sans">
            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 15 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="note-editor-shell bg-white rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] w-[95vw] h-[95vh] border border-slate-200"
            >
                <div className="note-editor-frame flex h-full flex-col overflow-hidden rounded-xl bg-white">
                    <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white shrink-0">
                        <input
                            type="text"
                            placeholder="Document Title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-3xl font-black text-slate-800 tracking-tight bg-transparent outline-none w-full placeholder-slate-300"
                            autoFocus
                        />
                        <button
                            onClick={onClose}
                            className="ml-6 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors shrink-0"
                            title="Close Editor"
                        >
                            <XMarkIcon className="w-7 h-7" />
                        </button>
                    </div>

                    <div className="note-editor-scroll flex-1 overflow-y-auto overflow-x-visible custom-scrollbar px-4 py-8 lg:px-20 lg:py-12 bg-white">
                        <div
                            ref={editorSurfaceRef}
                            className="note-editor-blocknote max-w-4xl mx-auto relative"
                        >
                            <BlockNoteView
                                editor={editor}
                                theme="light"
                                filePanel={true}
                            />
                        </div>
                    </div>

                    <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0 gap-4">
                        <div className="flex items-center gap-3 w-2/3">
                            <button
                                onClick={() => setShowFilingModal(true)}
                                className="shrink-0 px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-md shadow-sm hover:border-slate-400 hover:text-slate-900 transition-colors"
                                title="Change note location"
                            >
                                {currentStack && currentGroup
                                    ? `${currentStack.title} / ${currentGroup.title}`
                                    : "Unfiled"}
                            </button>

                            {/* Tags Input */}
                            <input
                                type="text"
                                placeholder="Add tags (comma separated)..."
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                className="px-4 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full max-w-md shadow-sm"
                            />
                        </div>

                        <div className="flex gap-3 shrink-0">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMainSaveClick}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-md transition-all active:scale-95"
                            >
                                Save Document
                            </button>
                        </div>
                    </div>
                </div>

                {showFilingModal && (
                    <div className="absolute inset-0 z-[10000] bg-slate-900/40 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 flex flex-col">
                            <h3 className="text-xl font-black text-slate-800 mb-2">
                                {currentGroup ? "Move Note" : "File this Note"}
                            </h3>
                            <p className="text-sm text-slate-500 mb-6">
                                {currentGroup
                                    ? "Select a new destination stack and folder for this note."
                                    : "This note is currently unfiled. Please select a destination folder before saving."}
                            </p>

                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                Parent Stack
                            </label>
                            <select
                                className="w-full mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                                value={filingStackId}
                                onChange={(e) => {
                                    setFilingStackId(e.target.value);
                                    setFilingGroupId("");
                                }}
                            >
                                <option value="">Select a Stack...</option>
                                {stacks.map((s: any) => (
                                    <option key={s.stack_id} value={s.stack_id}>
                                        {s.title}
                                    </option>
                                ))}
                            </select>

                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                Target Folder
                            </label>
                            <select
                                className="w-full mb-8 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 disabled:opacity-50"
                                value={filingGroupId}
                                onChange={(e) =>
                                    setFilingGroupId(e.target.value)
                                }
                                disabled={!filingStackId}
                            >
                                <option value="">Select a Folder...</option>
                                {groups
                                    .filter(
                                        (g: any) =>
                                            String(g.stack_id) ===
                                            String(filingStackId),
                                    )
                                    .map((g: any) => (
                                        <option
                                            key={g.group_id}
                                            value={g.group_id}
                                        >
                                            {g.title}
                                        </option>
                                    ))}
                            </select>

                            <div className="flex justify-between items-center mt-auto">
                                <button
                                    onClick={() => {
                                        setShowFilingModal(false);
                                        setSelectedGroupId("");
                                        executeSave("");
                                    }}
                                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Keep Unfiled
                                </button>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() =>
                                            setShowFilingModal(false)
                                        }
                                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedGroupId(filingGroupId);
                                            setShowFilingModal(false);
                                            executeSave(filingGroupId);
                                        }}
                                        disabled={!filingGroupId}
                                        className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-all disabled:opacity-50 disabled:active:scale-100 active:scale-95"
                                    >
                                        Confirm & Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
