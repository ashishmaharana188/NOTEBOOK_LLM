import React from "react";
import { IonIcon } from "@ionic/react";
import { createOutline, sparklesOutline } from "ionicons/icons";

export default function InteractiveNoteCard({
  note,
  onViewEchoClick,
}: {
  note: any;
  onViewEchoClick: (id: string) => void;
}) {
  return (
    <div className="bg-surface border border-border-subtle rounded-sm p-4 shadow-sm hover:border-slate-300 transition-colors mb-4">
      <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
            <IonIcon icon={createOutline} className="w-3 h-3 text-muted" /> User Note
          </span>
          {/* SAFE CHECK: Renders the Sparkles button if a valid link exists */}
          {note.linked_echo_id &&
            note.linked_echo_id !== "" &&
            note.linked_echo_id !== "null" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewEchoClick(note.linked_echo_id);
                }}
                className="text-muted hover:text-purple-600 transition-colors bg-purple-50 p-1 rounded-sm border border-purple-100"
                title="View Source Echo"
              >
                <IonIcon icon={sparklesOutline} className="w-3 h-3" />
              </button>
            )}
        </div>
        <span className="text-[9px] font-mono text-muted">
          {new Date(note.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="text-xs text-primary leading-relaxed font-serif whitespace-pre-wrap">
        {note.content}
      </p>
    </div>
  );
}
