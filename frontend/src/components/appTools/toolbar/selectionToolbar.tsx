import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  ArchiveBoxArrowDownIcon,
  Squares2X2Icon,
  ArrowUpOnSquareIcon,
} from "@heroicons/react/24/outline";
import { ManualCardCreator } from "../createCard/ManualCardCreator";
import { notify } from "../../system/AppNotifications";

interface SelectionToolbarProps {
  selectedCount: number;
  onArchive: () => void;
  onClear: () => void;
  onSetGrid: () => void;

  // NEW GLOBAL TOOL PROPS
  isShiftDown?: boolean;
  expandedStackId?: string | null;
  rootContextId?: string | null;
  activeLayout?: any[];
  canvasMode?: string;
  onUnarchive?: () => void;
  onSuccess?: () => void;
  showUnarchive?: boolean;
  isMergeMode?: boolean;
  setIsMergeMode?: (mode: boolean) => void;
  hasFoldersSelected?: boolean;
  archiveBlockedReason?: string | null;
  showLinkActions?: boolean;
  canLink?: boolean;
  canUnlinkLinks?: boolean;
  linkBlockedReason?: string | null;
  onLink?: () => void;
  onUnlinkLinks?: () => void;
}

export default function SelectionToolbar({
  selectedCount,
  onSetGrid,
  onArchive,
  onClear,
  isShiftDown,
  onUnarchive,
  expandedStackId,
  rootContextId,
  activeLayout,
  canvasMode,
  onSuccess,
  showUnarchive,
  isMergeMode,
  setIsMergeMode,
  hasFoldersSelected,
  archiveBlockedReason,
  showLinkActions,
  canLink,
  canUnlinkLinks,
  linkBlockedReason,
  onLink,
  onUnlinkLinks,
}: SelectionToolbarProps) {
  return (
    <AnimatePresence>
      {/* TRIGGER: Shows if items selected OR if Shift is held */}
      {(selectedCount > 0 || isShiftDown) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99999] pointer-events-auto"
        >
          {/* Glassmorphic Pill */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 px-6 py-3 bg-slate-900/90 rounded-full shadow-2xl border border-slate-700/50">
              {/* Counter */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-700/50">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-slate-900 font-bold text-xs">
                  {selectedCount}
                </span>
                <span className="text-sm font-medium text-slate-200"></span>
              </div>

              <button
                onClick={onSetGrid}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 border border-blue-500/30 transition-colors text-sm font-semibold"
              >
                <Squares2X2Icon className="w-4 h-4" />
              </button>

              {selectedCount > 0 && (
                <button
                  onClick={() => {
                    if (archiveBlockedReason) {
                      notify({
                        title: "Archive Blocked",
                        message: archiveBlockedReason,
                        tone: "warning",
                      });
                      return;
                    }
                    if (setIsMergeMode) setIsMergeMode(!isMergeMode);
                  }}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold shadow-sm ${
                    archiveBlockedReason
                      ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                      : isMergeMode
                        ? "bg-purple-500 text-white shadow-purple-500/30"
                        : "bg-white text-slate-600 hover:bg-purple-50 hover:text-purple-600"
                  }`}
                  title="Merge items into an existing Archive Folder"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                    />
                  </svg>
                  {isMergeMode ? "Select Target Archive..." : "Merge"}
                </button>
              )}

              {showLinkActions && (
                <button
                  onClick={() => {
                    if (!canLink) {
                      notify({
                        title: "Link Blocked",
                        message:
                          linkBlockedReason ||
                          "This selection cannot be linked.",
                        tone: "warning",
                      });
                      return;
                    }
                    if (onLink) onLink();
                  }}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold shadow-sm ${
                    canLink
                      ? "bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                      : "bg-slate-700/70 text-slate-300"
                  }`}
                  title={linkBlockedReason || "Create relationships between the selected cards"}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 010 5.656l-1.414 1.414a4 4 0 01-5.657-5.657l1.414-1.414m3.536-3.536a4 4 0 015.657 5.657l-1.414 1.414m-2.121-6.364l-4.243 4.242"
                    />
                  </svg>
                  Link
                </button>
              )}

              {showLinkActions && (
                <button
                  onClick={() => {
                    if (!canUnlinkLinks) {
                      notify({
                        title: "Unlink Blocked",
                        message:
                          linkBlockedReason ||
                          "No existing relationships were found in this selection.",
                        tone: "warning",
                      });
                      return;
                    }
                    if (onUnlinkLinks) onUnlinkLinks();
                  }}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold shadow-sm ${
                    canUnlinkLinks
                      ? "bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                      : "bg-slate-700/70 text-slate-300"
                  }`}
                  title={
                    linkBlockedReason ||
                    "Remove existing relationships within the selected cards"
                  }
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17l-10-10m0 10l10-10"
                    />
                  </svg>
                  Unlink
                </button>
              )}

              {showUnarchive && onUnarchive && (
                <button
                  onClick={onUnarchive}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 border border-orange-500/30 transition-colors text-sm font-semibold"
                  title="Unarchive Selected"
                >
                  <ArrowUpOnSquareIcon className="w-4 h-4" />
                </button>
              )}
              {!hasFoldersSelected && (
                <button
                  onClick={() => {
                    if (archiveBlockedReason) {
                      notify({
                        title: "Archive Blocked",
                        message: archiveBlockedReason,
                        tone: "warning",
                      });
                      return;
                    }
                    onArchive();
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-colors text-sm font-semibold ${
                    archiveBlockedReason
                      ? "bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
                  title={archiveBlockedReason || "Archive Selected Items"}
                >
                  <ArchiveBoxArrowDownIcon className="w-4 h-4" />
                </button>
              )}

              {/* Clear Action */}
              <button
                onClick={onClear}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-2"
                title="Clear Selection"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>

              {/* --- NEW GLOBAL CREATOR TOOL --- */}
              <ManualCardCreator
                targetId={expandedStackId}
                rootId={rootContextId}
                targetLayout={activeLayout}
                canvasMode={canvasMode}
                onSuccess={onSuccess}
              />
            </div>

            {archiveBlockedReason && (
              <div className="px-4 py-2 rounded-2xl bg-red-950/90 border border-red-500/40 text-red-100 text-[11px] font-semibold tracking-wide shadow-xl max-w-[560px]">
                {archiveBlockedReason}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
