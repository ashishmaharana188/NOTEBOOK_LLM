import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { animate } from "animejs";
import {
  XMarkIcon,
  CpuChipIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import useNotes from "../../.././../hooks/noteManager/useNotes";
import { notify } from "../../../system/AppNotifications";
import { useModelRuntime } from "../../../system/ModelRuntimeProvider";

const InspectorPanel = ({
  selectedNode,
  onClose,
}: {
  selectedNode: any;
  onClose: () => void;
}) => {
  const { ensureRolesThen } = useModelRuntime();
  const panelRef = useRef<HTMLDivElement>(null);

  const { renameStack, renameGroup } = useNotes();
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    // Reset state whenever a new node is clicked
    setIsRenaming(false);
    setEditName(selectedNode?.label || selectedNode?.title || "");

    if (panelRef.current) {
      animate(panelRef.current, {
        x: [50, 0],
        opacity: [0, 1],
        duration: 600,
        ease: "outExpo",
      });
    }
  }, [selectedNode]);

  const navigateToEcho = (clusterId: string) => {
    sessionStorage.setItem("pendingEchoAction", JSON.stringify({ clusterId }));
    window.dispatchEvent(
      new CustomEvent("SWITCH_TAB", { detail: "COGNITIVE_ECHO" }),
    );
  };

  const handleRename = async () => {
    if (selectedNode.group === "stacks") {
      await renameStack(selectedNode.id, editName);
    } else if (selectedNode.group === "notes" && !selectedNode.isSubnode) {
      await renameGroup(selectedNode.id, editName);
    }
    selectedNode.label = editName; // Optimistic visual update
    setIsRenaming(false);
  };

  // --- Proper Ingestion Handler ---
  const handleIngest = async () => {
    try {
      const targetFilename = selectedNode.filename || selectedNode.label;
      const res = await ensureRolesThen(["embedding"], () =>
        axios.post("http://127.0.0.1:8000/brain/ingest", {
          filename: targetFilename,
        }),
      );
      if (!res) return;

      if (res.data.error) {
        notify({
          title: "Ingestion Failed",
          message: `Ingestion Failed: ${res.data.error}`,
          tone: "error",
        });
      } else {
        notify({
          title: "Ingestion Triggered",
          message: `Ingestion triggered for: ${res.data.filename || targetFilename}`,
          tone: "success",
        });
      }
    } catch (e) {
      console.error("Ingest failed", e);
      notify({
        title: "Connection Failed",
        message: "Failed to connect to ingestion service.",
        tone: "error",
      });
    }
  };

  const navigateToNotes = (action: string, payload: any) => {
    sessionStorage.setItem(
      "pendingNoteAction",
      JSON.stringify({ type: action, payload }),
    );
    window.dispatchEvent(new CustomEvent("SWITCH_TAB", { detail: "NOTES" }));
  };

  if (!selectedNode) return null;

  const isSubnode = selectedNode.isSubnode;

  return (
    <div
      ref={panelRef}
      className="absolute top-6 right-6 w-80 bg-surface/95 backdrop-blur-sm border border-gray-300 shadow-2xl z-40 rounded-none flex flex-col max-h-[90%] overflow-y-auto"
    >
      <div className="p-5 pb-4 relative border-b border-border-subtle">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">
            {selectedNode.group} Inspector
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-primary transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Title / Renaming Input */}
        {isRenaming ? (
          <div className="flex gap-2 mb-3">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="flex-1 p-1 text-sm font-bold border border-gray-400 rounded bg-white text-primary"
            />
            <button
              onClick={handleRename}
              className="px-2 bg-accent text-accent-text text-[10px] font-bold uppercase rounded hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        ) : (
          <h2 className="text-lg font-bold text-primary leading-tight mb-3">
            {selectedNode.label || selectedNode.title}
          </h2>
        )}

        {selectedNode.author && selectedNode.author !== "Unknown" && (
          <p className="text-[11px] text-gray-600 mb-1 font-medium tracking-wide">
            SOURCE : {selectedNode.author}{" "}
            {selectedNode.year ? `- ${selectedNode.year}` : ""}
          </p>
        )}

        {selectedNode.description && (
          <p className="text-sm text-gray-700 italic border-l-2 border-gray-300 pl-3 my-4">
            "{selectedNode.description}"
          </p>
        )}

        {/* --- LAYER SPECIFIC ACTIONS --- */}

        {/* LAYER 1: LIBRARY (Ingest Only) */}
        {selectedNode.group === "library" && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleIngest}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-900 hover:bg-accent-hover text-white text-[10px] font-bold tracking-[0.2em] uppercase transition-colors rounded-none shadow-sm"
            >
              <CpuChipIcon className="w-4 h-4" /> Ingest
            </button>
          </div>
        )}

        {/* LAYER 3: ECHOES (Parent vs Subnode) */}
        {selectedNode.group === "echo" && !isSubnode && (
          <div className="flex flex-col gap-2 mt-4">
            <div className="p-3 bg-canvas border border-border-subtle text-xs font-bold text-muted uppercase flex items-center justify-between">
              <span>Status:</span>
              <span className="text-emerald-500 font-bold">Active Column</span>
            </div>
            {/* View Workspace Button */}
            <button
              onClick={() => navigateToEcho(selectedNode.id)}
              className="w-full py-2 bg-gray-900 hover:bg-accent-hover text-white text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm"
            >
              View Workspace
            </button>
          </div>
        )}
        {selectedNode.group === "echo" && isSubnode && (
          <div className="flex gap-2 mt-4">
            <button className="flex-1 py-2 border border-gray-900 text-primary hover:bg-gray-100 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors rounded-none flex items-center justify-center gap-2">
              <DocumentTextIcon className="w-4 h-4" /> Edit Node
            </button>
          </div>
        )}

        {/* LAYER 4: NOTES (Folder vs Note) */}
        {selectedNode.group === "notes" && !isSubnode && (
          <div className="flex flex-col gap-2 mt-4">
            {!isRenaming && (
              <button
                onClick={() => setIsRenaming(true)}
                className="w-full py-2 border border-gray-300 hover:border-gray-900 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors"
              >
                Rename Folder
              </button>
            )}
            <button
              onClick={() =>
                navigateToNotes("VIEW_FOLDER", { groupId: selectedNode.id })
              }
              className="w-full py-2 bg-gray-900 hover:bg-accent-hover text-white text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm"
            >
              View Folder Notes
            </button>
          </div>
        )}
        {selectedNode.group === "notes" && isSubnode && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() =>
                navigateToNotes("EDIT_NOTE", {
                  noteId: selectedNode.id,
                  groupId: selectedNode.groupId,
                })
              }
              className="flex-1 py-2 border border-gray-900 text-primary hover:bg-gray-100 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors rounded-none flex items-center justify-center gap-2"
            >
              <DocumentTextIcon className="w-4 h-4" /> Edit Note
            </button>
          </div>
        )}

        {/* LAYER 5: STACKS */}
        {selectedNode.group === "stacks" && (
          <div className="flex flex-col gap-2 mt-4">
            {!isRenaming && (
              <button
                onClick={() => setIsRenaming(true)}
                className="w-full py-2 border border-gray-300 hover:border-gray-900 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors"
              >
                Rename Stack
              </button>
            )}
            <button
              onClick={() =>
                navigateToNotes("VIEW_STACK", { stackId: selectedNode.id })
              }
              className="w-full py-2 bg-gray-900 hover:bg-accent-hover text-white text-[10px] font-bold uppercase tracking-widest transition-colors shadow-sm"
            >
              View Stack
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InspectorPanel;
