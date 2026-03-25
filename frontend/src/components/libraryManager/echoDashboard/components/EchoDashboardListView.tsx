import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LinkIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

function sanitizePreview(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function EchoDashboardListView({
  savedClusters = [],
  globalNotes = [],
  localLinkedNotes = {},
  unsavedEchoes = [],
  recommendations = [],
  loading = false,
  query = "",
  activeBookTitle = "Current Focus",
  viewMode = "ECHOES",
  setViewMode,
  handleToggleActive,
  handleSpawnCluster,
  onCreateNoteFromEcho,
  onManageNotes,
  onOpenLinkedNote,
}: any) {
  const [expandedClusterIds, setExpandedClusterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedEchoIds, setExpandedEchoIds] = useState<Set<string>>(
    () => new Set(),
  );

  const noteById = useMemo(() => {
    const next: Record<string, any> = {};
    globalNotes.forEach((note: any) => {
      next[String(note.note_id)] = note;
    });
    return next;
  }, [globalNotes]);

  const { roots, childrenByParentId } = useMemo(() => {
    const children: Record<string, any[]> = {};
    const rootNodes: any[] = [];

    savedClusters.forEach((cluster: any) => {
      const parentId = String(cluster.parent_cluster_id || "");
      if (!parentId) {
        rootNodes.push(cluster);
        return;
      }
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(cluster);
    });

    Object.values(children).forEach((items: any) =>
      items.sort((a: any, b: any) =>
        String(a.title || "").localeCompare(String(b.title || "")),
      ),
    );

    rootNodes.sort((a: any, b: any) =>
      String(a.title || "").localeCompare(String(b.title || "")),
    );

    return { roots: rootNodes, childrenByParentId: children };
  }, [savedClusters]);

  useEffect(() => {
    if (roots.length === 0) return;
    setExpandedClusterIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(roots.map((cluster: any) => String(cluster.id)));
    });
  }, [roots]);

  const toggleCluster = (clusterId: string) => {
    setExpandedClusterIds((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  };

  const toggleLinkedNotes = (echoId: string) => {
    setExpandedEchoIds((prev) => {
      const next = new Set(prev);
      if (next.has(echoId)) next.delete(echoId);
      else next.add(echoId);
      return next;
    });
  };

  const renderEchoRow = (chunk: any, cluster: any) => {
    const echoId = String(chunk.echo_id || chunk.chunk_id || "");
    const linkedNoteIds = (localLinkedNotes[echoId] || []).filter(Boolean);
    const hasLinkedNotes = linkedNoteIds.length > 0;
    const areLinkedNotesOpen = expandedEchoIds.has(echoId);

    return (
      <div
        key={`${cluster.id}-${echoId || chunk.title || chunk.text}`}
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h5 className="truncate text-sm font-black text-slate-900">
              {chunk.title || "Untitled Echo"}
            </h5>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">
              {chunk.relation || "Saved Insight"}
            </p>
            <p className="mt-2 line-clamp-2 text-xs text-slate-500">
              {sanitizePreview(chunk.bridge || chunk.text) ||
                "No preview available."}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onCreateNoteFromEcho?.({
                  markdown: chunk.text,
                  title: chunk.title,
                  echoId,
                })
              }
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100"
              title="Add linked note"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onManageNotes?.(echoId)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100"
              title="Manage linked notes"
            >
              <PencilSquareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            {linkedNoteIds.length} linked notes
          </span>
          {hasLinkedNotes && (
            <button
              type="button"
              onClick={() => toggleLinkedNotes(echoId)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition-colors hover:bg-slate-100"
            >
              {areLinkedNotesOpen ? (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5" />
              )}
              Linked Items
            </button>
          )}
        </div>

        {hasLinkedNotes && areLinkedNotesOpen && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            {linkedNoteIds.map((noteId: string) => {
              const note = noteById[String(noteId)];
              if (!note) return null;

              return (
                <button
                  key={noteId}
                  type="button"
                  onClick={() => onOpenLinkedNote?.(note)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <BookOpenIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">
                      {note.title || "Untitled Note"}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {sanitizePreview(
                        String(note.content || "").replace(/<[^>]*>/g, " "),
                      ) || "No preview available."}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCluster = (cluster: any, depth: number = 0): React.ReactNode => {
    const clusterId = String(cluster.id);
    const childClusters = childrenByParentId[clusterId] || [];
    const savedEchoes = (cluster.chunks || []).filter(
      (chunk: any) => chunk.type !== "note" && !chunk.note_id,
    );
    const isExpanded = expandedClusterIds.has(clusterId);

    return (
      <div key={clusterId} className="space-y-3">
        <section
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ marginLeft: depth * 24 }}
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <button
              type="button"
              onClick={() => toggleCluster(clusterId)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-500" />
              )}

              <div className="min-w-0">
                <h4 className="truncate text-base font-black text-slate-900">
                  {cluster.title || "Untitled Cluster"}
                </h4>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
                  <span>{savedEchoes.length} saved echoes</span>
                  <span>•</span>
                  <span>{childClusters.length} child columns</span>
                  {cluster.is_active && (
                    <>
                      <span>•</span>
                      <span className="font-black uppercase tracking-[0.12em] text-emerald-600">
                        Active
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleToggleActive?.(
                    cluster.id,
                    cluster.book_id,
                    cluster.library_id,
                  )
                }
                className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                  cluster.is_active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {cluster.is_active ? "Active" : "Make Active"}
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSpawnCluster?.(
                    cluster.id,
                    cluster.book_id,
                    cluster.library_id,
                    cluster.title,
                  )
                }
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition-colors hover:bg-slate-100"
              >
                Branch
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4">
              {savedEchoes.length === 0 && childClusters.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
                  No saved echoes or child columns in this cluster.
                </div>
              )}

              {savedEchoes.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Saved Echoes
                  </div>
                  {savedEchoes.map((chunk: any) =>
                    renderEchoRow(chunk, cluster),
                  )}
                </div>
              )}

              {childClusters.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Child Columns
                  </div>
                  {childClusters.map((child: any) =>
                    renderCluster(child, depth + 1),
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4  ">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
              Echo Hierarchy
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
              Saved columns, child branches, and linked notes
            </h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            {savedClusters.length} columns
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setViewMode?.("ECHOES")}
            className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
              viewMode === "ECHOES"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Inbox
          </button>
          <button
            type="button"
            onClick={() => setViewMode?.("RECS")}
            className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
              viewMode === "RECS"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Recs
          </button>
        </div>
      </div>

      <div className="space-y-6 p-5">
        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                {viewMode === "RECS" ? "Recommendations" : "Incoming Echoes"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {viewMode === "RECS"
                  ? "Recommendation stream for the current focus."
                  : `Live echoes for ${activeBookTitle}.`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
              Loading…
            </div>
          ) : viewMode === "RECS" ? (
            recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.map((rec: any, index: number) => (
                  <div
                    key={`${rec.id || rec.title}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="text-sm font-black text-slate-900">
                      {rec.title}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-500">
                      {rec.author || "Unknown Author"}
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {rec.description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
                No recommendations found.
              </div>
            )
          ) : unsavedEchoes.length > 0 ? (
            <div className="space-y-4">
              {unsavedEchoes.map((group: any, index: number) => (
                <div
                  key={`${group.id || group.title}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {group.title}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {group.chunks?.length || 0} connected echoes
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(group.chunks || []).map(
                      (chunk: any, chunkIndex: number) => (
                        <div
                          key={`${group.id || index}-${chunk.chunk_id || chunkIndex}`}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <h5 className="text-sm font-black text-slate-900">
                            {chunk.title || "Untitled Echo"}
                          </h5>
                          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600">
                            {chunk.relation || "AI Bridge"}
                          </p>
                          {query && (
                            <p className="mt-2 text-xs text-slate-500">
                              Triggered by: {query}
                            </p>
                          )}
                          <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                            {sanitizePreview(chunk.bridge || chunk.text) ||
                              "No preview available."}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-400">
              No incoming echoes.
            </div>
          )}
        </section>

        <section className="space-y-4">
          {roots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
              No saved columns yet.
            </div>
          ) : (
            roots.map((cluster: any) => renderCluster(cluster))
          )}
        </section>
      </div>
    </div>
  );
}
