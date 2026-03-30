import React from "react";
import { IonIcon } from "@ionic/react";
import { bookOutline, closeOutline } from "ionicons/icons";
import InteractiveChunkCard from "./InteractiveChunkCard";

export default function MaximizedColumnView({
  cluster,
  onClose,
  query,
  activeBookTitle,
  libraryId,
  onNoteClick,
  onManageNotes,
  onSaveSuccess,
  localLinkedNotes,
}: any) {
  if (!cluster) return null;

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/60   p-6 md:p-12 animate-in fade-in duration-300 pointer-events-auto">
      <div className="bg-slate-50 w-full max-w-5xl h-full rounded-[2rem] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-12 duration-500 ease-out">
        <div className="px-10 py-8 border-b border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-sm z-10">
          <div className="flex gap-6 items-center">
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <IonIcon icon={bookOutline} className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {cluster.title || activeBookTitle}
              </h2>
              <p className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-2">
                Focus View <span className="text-slate-300">•</span>{" "}
                {cluster.chunks?.length || 0} Nodes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 text-slate-400 bg-slate-100 hover:text-red-600 hover:bg-red-50 rounded-full transition-all active:scale-90 border border-transparent hover:border-red-200 shadow-sm"
          >
            <IonIcon icon={closeOutline} className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50/50">
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {cluster.chunks?.map((chunk: any, chunkIndex: number) => (
              <InteractiveChunkCard
                key={chunkIndex}
                chunk={chunk}
                chunkIndex={chunkIndex}
                query={query || ""}
                libraryId={libraryId}
                bookId={cluster.book_id}
                activeBookTitle={activeBookTitle || cluster.title}
                onNoteClick={onNoteClick}
                onManageNotes={onManageNotes}
                onSaveSuccess={onSaveSuccess}
                linkedNoteIds={
                  localLinkedNotes?.[chunk.echo_id || chunk.chunk_id] || []
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
