import React, { useState, useEffect, useRef } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import type {
    NoteStack,
    NoteGroup,
    NoteItem,
} from "../../../../hooks/noteManager/useNotes";
import GroupDivider from "./GroupDivider";
import GroupCard from "./GroupCard";
import { buildApiUrl } from "../../../../lib/runtimeConfig";

interface NoteStackColumnProps {
    stack: NoteStack;
    groups: NoteGroup[];
    activeGroupId: string | null;
    currentNotes: NoteItem[];
    initialPos: { x: number; y: number };
    zIndex: number;
    scale: number;
    bringToFront: (id: string) => void;
    onDragEnd: (id: string, pos: { x: number; y: number }) => void;
    onCreateGroup: (title: string, stackId: string) => void;
    onDeleteStack: (stackId: string) => void;
    onOpenGroup: (groupId: string) => void;
    onInitiateCreateNote: (groupId: string) => void;
    onOpenNote: (note: NoteItem) => void;
    onDeleteGroup: (groupId: string) => void;
    onDeleteNote: (noteId: string) => void;
    onRenameStack: (stackId: string, newTitle: string) => void;
    onRenameGroup: (groupId: string, newTitle: string) => void;
    isHighlighted?: boolean;
    highlightedGroupId?: string | null;
}

const NoteStackColumn = React.memo(
    ({
        stack,
        groups,
        activeGroupId,
        currentNotes,
        initialPos,
        zIndex,
        scale,
        bringToFront,
        onDragEnd,
        onCreateGroup,
        onDeleteStack,
        onOpenGroup,
        onInitiateCreateNote,
        onOpenNote,
        onDeleteGroup,
        onDeleteNote,
        onRenameStack,
        onRenameGroup,
        isHighlighted,
        highlightedGroupId,
    }: NoteStackColumnProps) => {
        const [isCreatingGroup, setIsCreatingGroup] = useState(false);
        const [draftTitle, setDraftTitle] = useState("");
        const [localPos, setLocalPos] = useState(initialPos || { x: 0, y: 0 });
        const [isDragging, setIsDragging] = useState(false);
        const dragRef = useRef({ startX: 0, startY: 0, x: 0, y: 0 });

        // THE FIX 1: Create a ref to track the absolute latest position without triggering re-renders
        const currentPos = useRef(initialPos || { x: 0, y: 0 });

        // EDIT STATES
        const [isRenamingStack, setIsRenamingStack] = useState(false);
        const [editStackTitle, setEditStackTitle] = useState(stack.title);

        useEffect(() => {
            if (initialPos) {
                setLocalPos(initialPos);
                currentPos.current = initialPos; // Keep ref in sync when parent forces an update
            }
        }, [initialPos]);

        const handleMouseDown = (e: React.MouseEvent) => {
            e.stopPropagation();
            bringToFront(stack.stack_id);
            setIsDragging(true);
            dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                x: localPos.x,
                y: localPos.y,
            };
        };

        useEffect(() => {
            const handleMouseMove = (e: MouseEvent) => {
                if (!isDragging) return;
                const dx = (e.clientX - dragRef.current.startX) / scale;
                const dy = (e.clientY - dragRef.current.startY) / scale;
                const newPos = {
                    x: dragRef.current.x + dx,
                    y: dragRef.current.y + dy,
                };

                currentPos.current = newPos; // THE FIX 2: Seamlessly update the ref during drag
                setLocalPos(newPos);
            };
            const handleMouseUp = () => {
                if (isDragging) {
                    setIsDragging(false);
                    // THE FIX 3: Pass the ref to the parent, completely bypassing the stale closure!
                    onDragEnd(stack.stack_id, currentPos.current);
                }
            };
            if (isDragging) {
                window.addEventListener("mousemove", handleMouseMove);
                window.addEventListener("mouseup", handleMouseUp);
            }
            return () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }, [isDragging, scale, stack.stack_id, onDragEnd]);

        const groupMap = new Map<string, NoteGroup[]>();
        [...groups]
            .sort((a, b) => a.title.localeCompare(b.title))
            .forEach((g) => {
                const c = (g.title.charAt(0) || "#").toUpperCase();
                if (!groupMap.has(c)) groupMap.set(c, []);
                groupMap.get(c)!.push(g);
            });

        const handleUploadCover = async (
            e: React.ChangeEvent<HTMLInputElement>,
            stackId: string,
        ) => {
            if (!e.target.files || !e.target.files[0] || !stackId) return;

            const formData = new FormData();
            formData.append("file", e.target.files[0]);

            try {
                await fetch(
                    buildApiUrl(`/upload/media/stack/${stackId}`),
                    {
                        method: "POST",
                        body: formData,
                    },
                );
                // Handle refetching from parent if needed
            } catch (error) {
                console.error("Failed to upload cover", error);
            }
        };

        let z = 10;
        const els: React.ReactNode[] = [];
        Array.from(groupMap.entries()).forEach(([char, charGroups]) => {
            els.push(<GroupDivider key={char} char={char} zIndex={z} />);
            z++;
            charGroups.forEach((g, i) => {
                els.push(
                    <GroupCard
                        key={g.group_id}
                        group={g}
                        zIndex={z}
                        stagger={i % 2 === 0 ? -10 : 10}
                        isActive={activeGroupId === g.group_id}
                        notes={activeGroupId === g.group_id ? currentNotes : []}
                        onOpen={() => onOpenGroup(g.group_id)}
                        onInitiateCreateNote={() =>
                            onInitiateCreateNote(g.group_id)
                        }
                        onOpenNote={onOpenNote}
                        onDeleteGroup={onDeleteGroup}
                        onDeleteNote={onDeleteNote}
                        onRenameGroup={onRenameGroup}
                        isHighlighted={highlightedGroupId === g.group_id}
                    />,
                );
                z++;
            });
            els.push(<div key={`spacer-${char}`} className="w-full" />);
        });

        return (
            <div
                id={stack.stack_id}
                className={`no-pan absolute flex flex-col items-center w-[650px] pb-32 ${
                    !isDragging
                        ? "transition-all duration-500"
                        : "transition-none"
                } ${isDragging ? "z-[9999]" : ""} ${isHighlighted ? "z-[9999]" : ""}`}
                style={{
                    // THE FIX: Move physics to the GPU, removing CPU layout calculations
                    left: 0,
                    top: 0,
                    transform: `translate3d(${localPos.x}px, ${localPos.y}px, 0)`,
                    willChange: "transform",
                    zIndex: isDragging || isHighlighted ? 9999 : zIndex,
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    bringToFront(stack.stack_id);
                }}
            >
                <div
                    className={`group w-[600px] mb-8 bg-surface/80 backdrop-blur border rounded-xl p-4 flex flex-col gap-4 relative transition-all duration-500 ${
                        isHighlighted
                            ? "border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.4)] scale-[1.03]"
                            : "border-gray-300 shadow-sm"
                    } ${isDragging ? "shadow-2xl cursor-grabbing" : "cursor-grab"}`}
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex justify-between items-center border-b border-gray-300 pb-2 relative pointer-events-none">
                        <div className="flex items-center gap-2 p-1.5 text-muted rounded-md">
                            <svg
                                className="w-1 h-1"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M4 8h16M4 16h16"
                                />
                            </svg>
                        </div>

                        <div className="absolute -top-1 right-135 z-50 pointer-events-auto opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <label
                                className="no-pan cursor-pointer bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*,video/*,audio/*"
                                    onChange={(e) =>
                                        handleUploadCover(e, stack.stack_id)
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <PlusIcon className="w-4 h-4" />
                            </label>
                        </div>
                        {isRenamingStack ? (
                            <div className="absolute left-10 flex gap-2 items-center pointer-events-auto z-10 w-3/4">
                                <input
                                    type="text"
                                    value={editStackTitle}
                                    onChange={(e) =>
                                        setEditStackTitle(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            onRenameStack(
                                                stack.stack_id,
                                                editStackTitle,
                                            );
                                            setIsRenamingStack(false);
                                        }
                                        if (e.key === "Escape") {
                                            setIsRenamingStack(false);
                                            setEditStackTitle(stack.title);
                                        }
                                    }}
                                    className="w-full p-1 text-lg font-bold border border-gray-400 rounded focus:outline-none pointer-events-auto bg-white"
                                    autoFocus
                                />
                                <button
                                    onClick={() => {
                                        setIsRenamingStack(false);
                                        setEditStackTitle(stack.title);
                                    }}
                                    className="text-xs text-muted pointer-events-auto"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="absolute left-10 flex items-center gap-2 group/stack pointer-events-auto">
                                <h3
                                    className="font-extrabold text-xl text-primary tracking-tight cursor-pointer hover:text-blue-600 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsRenamingStack(true);
                                        setEditStackTitle(stack.title);
                                    }}
                                    title="Click to rename"
                                >
                                    {stack.title}
                                </h3>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsRenamingStack(true);
                                        setEditStackTitle(stack.title);
                                    }}
                                    className="text-gray-400 hover:text-blue-500 opacity-0 group-hover/stack:opacity-100 transition-opacity"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                        />
                                    </svg>
                                </button>
                            </div>
                        )}

                        <div className="flex gap-2 pointer-events-auto">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteStack(stack.stack_id);
                                }}
                                className="text-gray-400 hover:text-red-500 transition"
                                title="Delete Stack"
                            >
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {isCreatingGroup ? (
                        <div
                            className="flex gap-2"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <input
                                autoFocus
                                type="text"
                                placeholder="Folder Name..."
                                value={draftTitle}
                                onChange={(e) => setDraftTitle(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    onCreateGroup(draftTitle, stack.stack_id)
                                }
                                className="flex-1 p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-900 font-bold"
                            />
                            <button
                                onClick={() => setIsCreatingGroup(false)}
                                className="px-2 text-xs font-bold text-muted hover:text-primary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onCreateGroup(draftTitle, stack.stack_id);
                                    setIsCreatingGroup(false);
                                    setDraftTitle("");
                                }}
                                className="px-3 text-xs font-bold bg-accent text-accent-text rounded hover:bg-accent-hover"
                            >
                                Save
                            </button>
                        </div>
                    ) : (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => setIsCreatingGroup(true)}
                            className="w-full py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm font-bold rounded transition border-dashed"
                        >
                            + New Folder
                        </button>
                    )}
                </div>
                <div
                    className="flex flex-col items-center w-full cursor-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {els.length > 0 ? (
                        els
                    ) : (
                        <div className="text-gray-400 font-mono text-xs italic mt-8">
                            [ EMPTY STACK ]
                        </div>
                    )}
                </div>
            </div>
        );
    },
);

export default NoteStackColumn;
