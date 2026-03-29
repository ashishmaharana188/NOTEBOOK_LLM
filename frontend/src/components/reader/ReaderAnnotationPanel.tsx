import React, { useState } from "react";
import type { ReaderAnnotation } from "../../types/readerBackendTypes";

interface ReaderAnnotationPanelProps {
  annotations: ReaderAnnotation[];
  onJump: (annotation: ReaderAnnotation) => void;
  onAddBookmark: () => void;
  embedded?: boolean;
  onUpdate: (
    annotationId: string,
    patch: Partial<
      Pick<
        ReaderAnnotation,
        "title" | "note" | "color" | "kind" | "page_label" | "chapter_label" | "anchor" | "quote_text"
      >
    >,
  ) => void;
  onDelete: (annotationId: string) => void;
}

const COLOR_OPTIONS = [
  { id: "amber", value: "#f59e0b" },
  { id: "sky", value: "#0ea5e9" },
  { id: "emerald", value: "#10b981" },
  { id: "rose", value: "#f43f5e" },
  { id: "violet", value: "#8b5cf6" },
  { id: "slate", value: "#64748b" },
];

export default function ReaderAnnotationPanel({
  annotations,
  onJump,
  onAddBookmark,
  embedded = false,
  onUpdate,
  onDelete,
}: ReaderAnnotationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftColor, setDraftColor] = useState("amber");

  const startEditing = (annotation: ReaderAnnotation) => {
    setEditingId(annotation.annotation_id);
    setDraftTitle(annotation.title || "");
    setDraftNote(annotation.note || "");
    setDraftColor(annotation.color || "amber");
  };

  const handleSave = (annotation: ReaderAnnotation) => {
    onUpdate(annotation.annotation_id, {
      title: draftTitle,
      note: draftNote,
      color: draftColor,
      kind: annotation.kind,
      page_label: annotation.page_label,
      chapter_label: annotation.chapter_label,
      anchor: annotation.anchor,
      quote_text: annotation.quote_text,
    });
    setEditingId(null);
  };

  return (
    <aside
      className={`${
        embedded
          ? "w-full"
          : "absolute top-44 left-4 bottom-4 z-40 w-[320px] bg-surface shadow-2xl"
      } flex flex-col overflow-hidden`}
    >
      <div className="flex items-center justify-between py-1">
        <div>
          <h2 className="text-sm font-semibold text-primary">Bookmarks</h2>
          <p className="text-xs text-muted">{annotations.length} saved locations</p>
        </div>
        <button
          onClick={onAddBookmark}
          className="text-xs font-medium uppercase tracking-[0.2em] text-primary"
        >
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {annotations.length === 0 ? (
          <div className="py-3 text-sm text-muted">
            Save a bookmark to keep your current place or add notes to important spots.
          </div>
        ) : (
          annotations.map((annotation) => {
            const isEditing = editingId === annotation.annotation_id;
            return (
              <div
                key={annotation.annotation_id}
                className="border-b border-black/10 py-3 last:border-b-0"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      placeholder="Bookmark title"
                      className="w-full border-b border-black/10 bg-transparent px-0 py-2 text-sm outline-none"
                    />
                    <textarea
                      value={draftNote}
                      onChange={(event) => setDraftNote(event.target.value)}
                      placeholder="Optional note"
                      rows={3}
                      className="w-full resize-none border-b border-black/10 bg-transparent px-0 py-2 text-sm outline-none"
                    />
                    <label className="block text-xs uppercase tracking-[0.18em] text-muted">
                      Color
                      <select
                        value={draftColor}
                        onChange={(event) => setDraftColor(event.target.value)}
                        className="mt-2 w-full bg-transparent px-0 py-1 text-sm text-primary outline-none"
                      >
                        {COLOR_OPTIONS.map((color) => (
                          <option key={color.id} value={color.id}>
                            {color.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center justify-end gap-4">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs font-medium uppercase tracking-[0.18em] text-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSave(annotation)}
                        className="text-xs font-medium uppercase tracking-[0.18em] text-primary"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onJump(annotation)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-primary truncate">
                            {annotation.title || annotation.page_label || "Bookmark"}
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {annotation.chapter_label ||
                              annotation.page_label ||
                              annotation.kind}
                          </div>
                        </div>
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{
                            backgroundColor:
                              COLOR_OPTIONS.find(
                                (option) => option.id === annotation.color,
                              )?.value || "#f59e0b",
                          }}
                        />
                      </div>
                      {annotation.note ? (
                        <p className="mt-2 text-xs leading-relaxed text-secondary">
                          {annotation.note}
                        </p>
                      ) : null}
                    </button>
                    <div className="mt-3 flex items-center justify-end gap-4">
                      <button
                        onClick={() => startEditing(annotation)}
                        className="text-xs font-medium uppercase tracking-[0.18em] text-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(annotation.annotation_id)}
                        className="text-xs font-medium uppercase tracking-[0.18em] text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
