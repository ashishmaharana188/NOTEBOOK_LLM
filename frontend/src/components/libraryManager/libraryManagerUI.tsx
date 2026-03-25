import React, { useState, useEffect } from "react";
import MyLibrary from "./myLibrary/myLibraryUI";
import TheBrain from "./theBrain/theBrainUI";
import Discover from "./discover/discoverUI";
import MindMapUI from "./mindMap/mindMapUI";
import { useTheme } from "../../hooks/useTheme";
import type { LibraryManagerProps } from "./libraryManagerTypes";

export default function LibraryManager(
  props: LibraryManagerProps & {
    onOpenGlobalWorkspace?: (view: "ECHOES" | "NOTES" | "SPATIAL") => void;
  },
) {
  const [tab, setTab] = useState("LIBRARY");
  const { theme, setTheme } = useTheme();

  // Global Tab Switcher Listener (From Sidebar)
  useEffect(() => {
    const handleTabSwitch = (e: any) => {
      if (e.detail) setTab(e.detail);
    };
    window.addEventListener("SWITCH_TAB", handleTabSwitch);
    return () => window.removeEventListener("SWITCH_TAB", handleTabSwitch);
  }, []);

  const {
    libraryFiles = [],
    brainBooks = [],
    ingesting,
    ingestQueue,
    onUpload,
    onIngest,
    onCancelIngest,
    onDeleteLibrary,
    onDeleteBrain,
    onRead,
    onStartDownload,
  } = props;

  return (
    <div className="h-full overflow-y-auto bg-canvas p-4 sm:p-8">
      <div className="max-w-8xl mx-auto">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="ml-0 text-3xl font-bold text-primary sm:ml-10"></h1>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-1.5 px-3 shadow-sm transition-colors duration-300 sm:ml-10 sm:self-start xl:self-auto">
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest mr-2">
              Theme
            </span>
            <button
              onClick={() => setTheme("light")}
              className={`w-5 h-5 rounded-full border shadow-inner transition-all ${
                theme === "light"
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-surface scale-110"
                  : "border-gray-300 opacity-70 hover:opacity-100 hover:scale-110"
              } bg-[#f8f9fa]`}
            />
            <button
              onClick={() => setTheme("dark")}
              className={`w-5 h-5 rounded-full border shadow-inner transition-all ${
                theme === "dark"
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-surface scale-110"
                  : "border-gray-700 opacity-70 hover:opacity-100 hover:scale-110"
              } bg-[#0f172a]`}
            />
            <button
              onClick={() => setTheme("warm")}
              className={`w-5 h-5 rounded-full border shadow-inner transition-all ${
                theme === "warm"
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-surface scale-110"
                  : "border-[#e6dfcc] opacity-70 hover:opacity-100 hover:scale-110"
              } bg-[#fdf6e3]`}
            />
            <button
              onClick={() => setTheme("cool")}
              className={`w-5 h-5 rounded-full border shadow-inner transition-all ${
                theme === "cool"
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-surface scale-110"
                  : "border-[#cffafe] opacity-70 hover:opacity-100 hover:scale-110"
              } bg-[#ecfeff]`}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface p-1 shadow-sm">
            <div className="flex min-w-max">
            {[
              "LIBRARY",
              "BRAIN",
              "WORKSPACE",
              "NOTES",
              "MINDMAP",
              "SPATIAL_CANVAS",
              "DISCOVERY",
            ].map((t) => (
              <button
                key={t}
                onClick={() => {
                  // If the user clicks a workspace tool, trigger the global shell overlay!
                  if (["WORKSPACE", "NOTES", "SPATIAL_CANVAS"].includes(t)) {
                    let targetView: "ECHOES" | "NOTES" | "SPATIAL" = "ECHOES";
                    if (t === "NOTES") targetView = "NOTES";
                    if (t === "SPATIAL_CANVAS") targetView = "SPATIAL";
                    if (props.onOpenGlobalWorkspace)
                      props.onOpenGlobalWorkspace(targetView);
                  } else {
                    setTab(t); // Otherwise, safely switch the local library tab
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${
                  tab === t
                    ? "bg-accent text-accent-text shadow-md"
                    : "text-muted hover:text-primary"
                }`}
              >
                {t === "LIBRARY" && "My Library"}
                {t === "BRAIN" && "The Brain"}
                {t === "NOTES" && "Notes"}
                {t === "WORKSPACE" && "Workspace"}
                {t === "MINDMAP" && "Mind Map"}
                {t === "SPATIAL_CANVAS" && "Spatial Canvas"}
                {t === "DISCOVERY" && "Discover"}
              </button>
            ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {tab === "LIBRARY" && (
          <MyLibrary
            libraryFiles={libraryFiles}
            brainBooks={brainBooks}
            ingesting={ingesting}
            ingestQueue={ingestQueue}
            onUpload={onUpload}
            onIngest={onIngest}
            onCancelIngest={onCancelIngest}
            onDelete={onDeleteLibrary}
            onRead={onRead}
          />
        )}
        {tab === "BRAIN" && (
          <TheBrain brainBooks={brainBooks as any} onDelete={onDeleteBrain} />
        )}
        {tab === "MINDMAP" && <MindMapUI />}
        {tab === "DISCOVERY" && <Discover onStartDownload={onStartDownload} />}
      </div>
    </div>
  );
}
