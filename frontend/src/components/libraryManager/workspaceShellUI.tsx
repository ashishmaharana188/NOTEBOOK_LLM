import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  MinusIcon,
  XMarkIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useCanvasSnapshot } from "../system/CanvasSnapshotProvider";

const EchoDashboardUI = React.lazy(() => import("./echoDashboard/echoDashboardUI"));
const NotesSectionUI = React.lazy(() => import("./noteModule/notesSectionUI"));
const SpatialCanvasUI = React.lazy(() => import("./spatialCanvas/spatialCanvasUI"));
const SystemConfigPanel = React.lazy(() => import("./system/systemConfigPanel"));
const EchoContextModal = React.lazy(() => import("./shared/EchoContextModal"));

export default function WorkspaceShellUI(props: any) {
  const {
    isOpen,
    onClose,
    onOpen,
    results = [],
    recommendations = [],
    currentView,
  } = props;

  const [activeTab, setActiveTab] = useState<
    "ECHOES" | "NOTES" | "SPATIAL" | "SYSTEM"
  >(
    currentView || "ECHOES",
  );
  const [isMinimized, setIsMinimized] = useState(false);

  const [focusedEchoId, setFocusedEchoId] = useState<string | null>(null);
  const {
    clusters: savedEchoes,
    notes: savedNotes,
    manualLinks: savedManualLinks,
    spatialMetadata,
    ensureCanvasSnapshot,
    refreshCanvasSnapshot,
    setCanvasSnapshotActive,
  } = useCanvasSnapshot();

  // ONE coordinated effect when the workspace opens
  useEffect(() => {
    if (isOpen) {
      ensureCanvasSnapshot();
    }
  }, [ensureCanvasSnapshot, isOpen]);

  useEffect(() => {
    setCanvasSnapshotActive(isOpen);
  }, [isOpen, setCanvasSnapshotActive]);

  // Sync external navigation clicks from App.tsx
  useEffect(() => {
    if (isOpen && currentView) {
      setActiveTab(currentView);
      setIsMinimized(false);
    }
  }, [isOpen, currentView]);

  const openNoteEditor = useCallback((node: any) => {
    const noteId = node.note_id || node.chunk_id || node.id;
    const groupId = node.group_id || node.parent_id || node.cluster_id || "unfiled";
    const text = node.text || node.content || "";

    sessionStorage.setItem(
      "pendingNoteAction",
      JSON.stringify({
        type: "EDIT_NOTE",
        payload: { noteId, groupId, text },
      }),
    );
    window.dispatchEvent(new Event("noteActionDispatched"));
    setFocusedEchoId(null);
    setActiveTab("NOTES");
  }, []);

  const activePanel = useMemo(() => {
    switch (activeTab) {
      case "ECHOES":
        return (
          <EchoDashboardUI
            {...props}
            savedGlobalClusters={savedEchoes}
            globalNotes={savedNotes}
          />
        );
      case "SPATIAL":
        return (
          <SpatialCanvasUI
            clusters={savedEchoes || []}
            notes={savedNotes || []}
            manualLinks={savedManualLinks || []}
            fetchClusters={refreshCanvasSnapshot}
            spatialMetadata={spatialMetadata}
            onFocusNote={(node: any) => {
              if (node?.note_id || node?.type === "note") {
                openNoteEditor(node);
                return;
              }

              const resolvedEchoId =
                node?.echo_id || node?.chunk_id || node?.id || null;
              if (resolvedEchoId) {
                setFocusedEchoId(String(resolvedEchoId));
              }
            }}
            onOpenMindMap={(nodeId: string) => {
              sessionStorage.setItem(
                "pendingMindMapAction",
                JSON.stringify({ nodeId }),
              );
              window.dispatchEvent(
                new CustomEvent("SWITCH_TAB", { detail: "MINDMAP" }),
              );
              onClose();
            }}
          />
        );
      case "NOTES":
        return <NotesSectionUI />;
      case "SYSTEM":
        return <SystemConfigPanel />;
      default:
        return null;
    }
  }, [
    activeTab,
    onClose,
    openNoteEditor,
    props,
    refreshCanvasSnapshot,
    savedEchoes,
    savedManualLinks,
    savedNotes,
    spatialMetadata,
  ]);

  if (!isOpen || isMinimized) {
    const totalItems = (results?.length || 0) + (recommendations?.length || 0);
    return (
      <div
        onClick={() => {
          if (onOpen) onOpen();
          setIsMinimized(false);
        }}
        className="fixed bottom-8 right-8 z-[150] w-14 h-14 bg-slate-900 rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group border border-slate-700"
        title="Open Workspace"
      >
        <SparklesIcon className="w-6 h-6 text-slate-300 group-hover:text-white transition-colors" />
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold font-mono w-5 h-5 flex items-center justify-center rounded-full border border-white">
            {totalItems}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] transition-opacity duration-300 font-sans pointer-events-auto">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => setIsMinimized(true)}
      ></div>

      <div className="absolute inset-4 bg-[#f8fafc] shadow-2xl border border-slate-300 flex flex-col overflow-hidden text-primary animate-in zoom-in-95 duration-200">
        <div className="absolute top-6 left-6 z-[2500] flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-1 bg-surface/95   p-1 rounded-sm shadow-sm border border-border-subtle">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 text-muted hover:text-primary hover:bg-canvas rounded-sm transition-all"
            >
              <MinusIcon className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-sm transition-all"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-surface/95   p-1 rounded-sm shadow-sm border border-border-subtle flex gap-1">
            <button
              onClick={() => setActiveTab("ECHOES")}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
                activeTab === "ECHOES"
                  ? "bg-slate-200 text-slate-800 shadow-sm"
                  : "text-muted hover:text-primary hover:bg-slate-100"
              }`}
            >
              Echo Canvas
            </button>
            <button
              onClick={() => setActiveTab("SPATIAL")}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-1 ${
                activeTab === "SPATIAL"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-purple-600 hover:bg-purple-50"
              }`}
            >
              Reader Canvas
            </button>
            <button
              onClick={() => setActiveTab("NOTES")}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
                activeTab === "NOTES"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-muted hover:text-primary hover:bg-slate-100"
              }`}
            >
              Notes Canvas
            </button>
            <button
              onClick={() => setActiveTab("SYSTEM")}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
                activeTab === "SYSTEM"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-amber-700 hover:bg-amber-50"
              }`}
            >
              System
            </button>
          </div>
        </div>

        <div className="flex-1 w-full h-full relative">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-[#f8fafc] text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Loading Workspace
              </div>
            }
          >
            {activePanel}
          </Suspense>
        </div>

        {focusedEchoId && (
          <Suspense fallback={null}>
            <EchoContextModal
              echoId={focusedEchoId}
              onClose={() => setFocusedEchoId(null)}
              onOpenNote={openNoteEditor}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
