import React, { useMemo } from "react";
import FocusedReadingWorkspace, {
  buildSavedDerivedPanelsBySourceId,
} from "../../shared/FocusedReadingWorkspace";

function normalizeChunkToItem(
  chunk: any,
  cluster: any,
  fallbackTitle: string,
  libraryId: string,
) {
  const itemId = String(chunk.echo_id || chunk.chunk_id || chunk.note_id || "");
  if (!itemId) return null;

  return {
    id: itemId,
    title: chunk.title || fallbackTitle || "Untitled Echo",
    text: String(chunk.text || chunk.bridge || ""),
    fullText: String((chunk as any).full_text || ""),
    chapter: chunk.chapter || "",
    sourceLabel: String(
      chunk.filename || cluster?.title || fallbackTitle || "",
    ),
    filename: String(chunk.filename || ""),
    chunkId: String(chunk.chunk_id || ""),
    echoId: String(chunk.echo_id || ""),
    clusterId: String(cluster?.id || cluster?.cluster_id || ""),
    sourceAnchorId: String(cluster?.id || cluster?.cluster_id || ""),
    bookId: String(cluster?.book_id || fallbackTitle || ""),
    libraryId: String(cluster?.library_id || libraryId || ""),
    kind: chunk.note_id ? "note" : "echo",
  };
}

export default function MaximizedColumnView({
  cluster,
  allClusters = [],
  initialEchoId = "",
  onClose,
  activeBookTitle,
  libraryId,
  onRefreshSaved,
  adHocItems = [],
  adHocTitle = "",
  adHocSubtitle = "",
}: any) {
  const items = useMemo(() => {
    if (Array.isArray(adHocItems) && adHocItems.length > 0) {
      return adHocItems;
    }

    const echoChunks = (cluster?.chunks || []).filter(
      (chunk: any) => chunk.type !== "note" && !chunk.note_id,
    );
    return echoChunks
      .map((chunk: any) =>
        normalizeChunkToItem(chunk, cluster, activeBookTitle, libraryId),
      )
      .filter(Boolean);
  }, [activeBookTitle, adHocItems, cluster, libraryId]);

  const savedPanelsBySourceId = useMemo(
    () => buildSavedDerivedPanelsBySourceId(allClusters || []),
    [allClusters],
  );

  if (!items.length && !cluster) return null;

  return (
    <FocusedReadingWorkspace
      workspaceTitle={
        adHocTitle || cluster?.title || activeBookTitle || "Focused Reading"
      }
      workspaceSubtitle={adHocSubtitle || "Deep reading workspace"}
      items={items}
      initialItemId={initialEchoId || String(items[0]?.id || "")}
      savedPanelsBySourceId={savedPanelsBySourceId}
      onClose={onClose}
      onRefreshSaved={onRefreshSaved}
    />
  );
}
