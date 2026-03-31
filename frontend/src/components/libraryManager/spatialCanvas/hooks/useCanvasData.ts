import { useMemo } from "react";

export default function useCanvasData(
  canvasMode: "ECHO" | "NOTES",
  clusters: any[] = [],
  stacks: any[] = [],
  groups: any[] = [],
  allNotes: any[] = [],
  manualLinks: any[] = [],
  rootExpandedId: string | null = null,
) {
  // 1. THE INDEXES: O(1) UNIFIED STATE AND RELATIONSHIP MAPS
  const indexes = useMemo(() => {
    const clustersById: Record<string, any> = {};
    const stacksById: Record<string, any> = {};
    const groupsById: Record<string, any> = {};
    const archiveGroupsById: Record<string, any> = {};
    const archiveGroupsByDisplayParentId: Record<string, any[]> = {};
    const archiveGroupIdsByDisplayParentId: Record<string, Set<string>> = {};

    const rootClusterIdByClusterId: Record<string, string> = {};
    const clusterByEchoId: Record<string, any> = {};
    const clusterByNoteId: Record<string, any> = {};
    const groupByItemId: Record<string, string> = {};
    const groupContentsById: Record<string, any[]> = {};
    const groupContentIdsByGroupId: Record<string, Set<string>> = {};
    const archiveStateByItemId: Record<string, "none" | "inner" | "outer"> = {};
    const archiveContextByItemId: Record<
      string,
      "echo_related" | "notes_only"
    > = {};

    const echoesById: Record<string, any> = {};
    const notesById: Record<string, any> = {};
    const notesByLinkedEchoId: Record<string, any[]> = {};
    const groupsByOwnerId: Record<string, any[]> = {};
    const linkedEchoIdsByNoteId: Record<string, string[]> = {};
    const linkedNoteIdsByEchoId: Record<string, string[]> = {};
    const linkedNoteIdsByNoteId: Record<string, string[]> = {};
    const linkedItemIdsByItemId: Record<string, string[]> = {};
    const manualLinkKeySet = new Set<string>();
    const linkSummaryByItemId: Record<string, any> = {};
    const isInjectedManualNote = (item: any) => {
      const tags = String(item?.tags || "");
      return (
        tags.includes("manual_canvas:1") || tags.includes("manual_injected:1")
      );
    };

    clusters.forEach((c) => {
      const clusterId = c.id || c.cluster_id;
      clustersById[clusterId] = c;
      archiveContextByItemId[clusterId] = "echo_related";
    });
    stacks.forEach((s) => {
      stacksById[s.stack_id] = s;
      archiveContextByItemId[s.stack_id] = "notes_only";
    });

    const appendArchiveDisplayParent = (parentId: string, group: any) => {
      if (!parentId || !group?.group_id) return;
      if (!archiveGroupsByDisplayParentId[parentId]) {
        archiveGroupsByDisplayParentId[parentId] = [];
      }
      if (!archiveGroupIdsByDisplayParentId[parentId]) {
        archiveGroupIdsByDisplayParentId[parentId] = new Set();
      }
      if (archiveGroupIdsByDisplayParentId[parentId].has(group.group_id)) return;

      archiveGroupsByDisplayParentId[parentId].push(group);
      archiveGroupIdsByDisplayParentId[parentId].add(group.group_id);
    };

    groups.forEach((g) => {
      groupsById[g.group_id] = g;
      groupContentsById[g.group_id] = [];
      groupContentIdsByGroupId[g.group_id] = new Set();
      if (g.group_kind === "archive") {
        archiveGroupsById[g.group_id] = g;
        const displayParentId =
          g.display_parent_id ||
          g.restore_group_id ||
          g.owner_item_id ||
          g.stack_id;
        if (displayParentId) {
          appendArchiveDisplayParent(displayParentId, g);
        }
        // Keep inner archives discoverable in notes mode even when they were
        // created from echo mode and only their restore target points at the
        // filed notes folder.
        if (
          g.restore_group_id &&
          g.restore_group_id !== displayParentId
        ) {
          appendArchiveDisplayParent(g.restore_group_id, g);
        }
      }

      const ownerId = g.stack_id || g.owner_item_id;
      if (ownerId) {
        if (!groupsByOwnerId[ownerId]) groupsByOwnerId[ownerId] = [];
        groupsByOwnerId[ownerId].push(g);
      }
    });

    const getUltimateRootId = (clusterId: string): string => {
      const cluster = clustersById[clusterId];
      if (!cluster) return clusterId;
      if (!cluster.parent_cluster_id) return cluster.id || cluster.cluster_id;
      return getUltimateRootId(cluster.parent_cluster_id);
    };

    const appendGroupContent = (groupId: string, itemId: string, item: any) => {
      if (!groupContentsById[groupId]) groupContentsById[groupId] = [];
      if (!groupContentIdsByGroupId[groupId])
        groupContentIdsByGroupId[groupId] = new Set();
      if (groupContentIdsByGroupId[groupId].has(itemId)) return;

      groupContentsById[groupId].push(item);
      groupContentIdsByGroupId[groupId].add(itemId);
    };

    const appendUniqueId = (
      container: Record<string, Set<string>>,
      ownerId: string,
      linkedId: string,
    ) => {
      if (!ownerId || !linkedId) return;
      if (!container[ownerId]) container[ownerId] = new Set();
      container[ownerId].add(linkedId);
    };

    const linkedEchoIdSetsByNoteId: Record<string, Set<string>> = {};
    const linkedNoteIdSetsByEchoId: Record<string, Set<string>> = {};
    const linkedNoteIdSetsByNoteId: Record<string, Set<string>> = {};
    const linkedItemIdSetsByItemId: Record<string, Set<string>> = {};

    const registerManualLink = (leftId: string, rightId: string) => {
      const a = String(leftId || "");
      const b = String(rightId || "");
      if (!a || !b || a === b) return;

      const normalizedPair = [a, b].sort();
      const sourceId = normalizedPair[0] || a;
      const targetId = normalizedPair[1] || b;
      manualLinkKeySet.add(`${sourceId}::${targetId}`);

      const sourceIsNote = sourceId.startsWith("note_");
      const targetIsNote = targetId.startsWith("note_");
      const sourceIsEcho = sourceId.startsWith("echo_");
      const targetIsEcho = targetId.startsWith("echo_");

      if (
        (sourceIsNote && targetIsEcho) ||
        (sourceIsEcho && targetIsNote)
      ) {
        const noteId = sourceIsNote ? sourceId : targetId;
        const echoId = sourceIsEcho ? sourceId : targetId;
        appendUniqueId(linkedEchoIdSetsByNoteId, noteId, echoId);
        appendUniqueId(linkedNoteIdSetsByEchoId, echoId, noteId);
      } else if (sourceIsNote && targetIsNote) {
        appendUniqueId(linkedNoteIdSetsByNoteId, sourceId, targetId);
        appendUniqueId(linkedNoteIdSetsByNoteId, targetId, sourceId);
      }

      appendUniqueId(linkedItemIdSetsByItemId, sourceId, targetId);
      appendUniqueId(linkedItemIdSetsByItemId, targetId, sourceId);
    };

    clusters.forEach((c) => {
      const cid = c.id || c.cluster_id;
      const rootCid = getUltimateRootId(cid);
      rootClusterIdByClusterId[cid] = rootCid;

      const isOuterArchived = !!clustersById[rootCid]?.archive_group_id;

      (c.chunks || []).forEach((chunk: any) => {
        const itemId = chunk.echo_id || chunk.note_id || chunk.chunk_id;
        if (!itemId) return;

        // UI FIX: Inject types natively so styling engine catches it
        if (chunk.echo_id || chunk.type === "echo") {
          clusterByEchoId[itemId] = c;
          echoesById[itemId] = { ...chunk, type: "echo" };
          archiveContextByItemId[itemId] = "echo_related";
        } else if (chunk.note_id || chunk.type === "note") {
          clusterByNoteId[itemId] = c;
          archiveContextByItemId[itemId] = "echo_related";
        }

        if (chunk.group_id) {
          groupByItemId[itemId] = chunk.group_id;
          appendGroupContent(chunk.group_id, String(itemId), {
            ...chunk,
            type:
              chunk.type === "note" || chunk.note_id ? "note" : "echo",
          });
        }

        if (chunk.group_id && archiveGroupsById[chunk.group_id]) {
          archiveStateByItemId[itemId] = "inner";
        } else if (isOuterArchived) {
          archiveStateByItemId[itemId] = "outer";
        } else {
          archiveStateByItemId[itemId] = "none";
        }
      });
    });

    allNotes.forEach((n: any) => {
      const noteId = n.note_id;
      if (!noteId) return;
      notesById[noteId] = n;

      // UI FIX: Inject types natively
      if (n.group_id) {
        groupByItemId[noteId] = n.group_id;
        appendGroupContent(n.group_id, String(noteId), {
          ...n,
          type: "note",
        });
      }
    });

    manualLinks.forEach((link: any) => {
      if (link?.edge_type && link.edge_type !== "manual_link") return;
      registerManualLink(link?.source_id, link?.target_id);
    });

    allNotes.forEach((n: any) => {
      const noteId = n.note_id;
      if (!noteId) return;
      if (
        n.linked_echo_id &&
        (!linkedEchoIdSetsByNoteId[noteId] ||
          linkedEchoIdSetsByNoteId[noteId].size === 0)
      ) {
        registerManualLink(noteId, n.linked_echo_id);
      }
    });

    Object.entries(linkedEchoIdSetsByNoteId).forEach(([noteId, echoIds]) => {
      linkedEchoIdsByNoteId[noteId] = Array.from(echoIds);
      linkedItemIdsByItemId[noteId] = Array.from(
        linkedItemIdSetsByItemId[noteId] || [],
      );
    });

    Object.entries(linkedNoteIdSetsByEchoId).forEach(([echoId, noteIds]) => {
      linkedNoteIdsByEchoId[echoId] = Array.from(noteIds);
      linkedItemIdsByItemId[echoId] = Array.from(
        linkedItemIdSetsByItemId[echoId] || [],
      );
    });

    Object.entries(linkedNoteIdSetsByNoteId).forEach(([noteId, noteIds]) => {
      linkedNoteIdsByNoteId[noteId] = Array.from(noteIds);
      linkedItemIdsByItemId[noteId] = Array.from(
        linkedItemIdSetsByItemId[noteId] || [],
      );
    });

    const resolveLinkedItemTitle = (itemId: string | null) => {
      if (!itemId) return null;
      if (itemId.startsWith("note_")) {
        return notesById[itemId]?.title || "Untitled Note";
      }
      if (itemId.startsWith("echo_")) {
        return echoesById[itemId]?.title || "Untitled Echo";
      }
      return null;
    };

    allNotes.forEach((n: any) => {
      const noteId = n.note_id;
      if (!noteId) return;
      const linkedEchoIds = linkedEchoIdsByNoteId[noteId] || [];
      linkedEchoIds.forEach((echoId) => {
        if (!notesByLinkedEchoId[echoId]) notesByLinkedEchoId[echoId] = [];
        const linkedNotes = notesByLinkedEchoId[echoId];
        if (!linkedNotes.find((note: any) => String(note.note_id) === String(noteId))) {
          linkedNotes.push({ ...n, type: "note" });
        }
      });

      let isOuter = false;
      linkedEchoIds.forEach((echoId) => {
        const clusterRef = clusterByEchoId[echoId];
        if (!clusterRef) return;

        const clusterKey = String(clusterRef.id || clusterRef.cluster_id || "");
        if (!clusterKey) return;

        const rootCid = rootClusterIdByClusterId[clusterKey] || clusterKey;
        if (rootCid && clustersById[rootCid]?.archive_group_id) isOuter = true;
      });
      if (n.group_id && groupsById[n.group_id]) {
        const stackId = groupsById[n.group_id].stack_id;
        if (stacksById[stackId]?.archive_group_id) isOuter = true;
      }

      if (n.group_id && archiveGroupsById[n.group_id]) {
        archiveStateByItemId[noteId] = "inner";
      } else if (isOuter) {
        archiveStateByItemId[noteId] = "outer";
      } else {
        archiveStateByItemId[noteId] = "none";
      }

      if (
        archiveContextByItemId[noteId] !== "echo_related" &&
        (linkedEchoIds.length > 0 ||
          clusterByNoteId[noteId] ||
          isInjectedManualNote(n))
      ) {
        archiveContextByItemId[noteId] = "echo_related";
      } else if (!archiveContextByItemId[noteId]) {
        archiveContextByItemId[noteId] = "notes_only";
      }

      const noteNeighborIds = Array.from(
        new Set([
          ...(linkedEchoIdsByNoteId[noteId] || []),
          ...(linkedNoteIdsByNoteId[noteId] || []),
        ]),
      );
      const singleNeighborId =
        noteNeighborIds.length === 1 ? (noteNeighborIds[0] ?? null) : null;
      const primaryEchoId =
        n.linked_echo_id &&
        linkedEchoIds.includes(String(n.linked_echo_id))
          ? String(n.linked_echo_id)
          : linkedEchoIds[0] || null;
      linkSummaryByItemId[noteId] = {
        count: noteNeighborIds.length,
        neighborIds: noteNeighborIds,
        primaryEchoId,
        primaryLinkedTitle: resolveLinkedItemTitle(singleNeighborId),
        primaryEchoTitle: primaryEchoId
          ? echoesById[primaryEchoId]?.title || null
          : null,
      };
    });

    Object.entries(linkedNoteIdsByEchoId).forEach(([echoId, noteIds]) => {
      const uniqueNoteIds = Array.from(new Set(noteIds));
      const singleNeighborId =
        uniqueNoteIds.length === 1 ? String(uniqueNoteIds[0] ?? "") : null;
      linkSummaryByItemId[echoId] = {
        count: uniqueNoteIds.length,
        neighborIds: uniqueNoteIds,
        primaryLinkedTitle: resolveLinkedItemTitle(singleNeighborId),
      };
    });

    // Mirror inner archives into related echo roots so linked-note archives created in NOTES
    // mode still appear in ECHO mode where those notes normally live.
    Object.values(archiveGroupsById).forEach((archiveGroup: any) => {
      const archiveContents = groupContentsById[archiveGroup.group_id] || [];
      const relatedRootIds = new Set<string>();

      archiveContents.forEach((item: any) => {
        let clusterRef: any = null;
        const relatedEchoId =
          item?.echo_id ||
          (item?.type === "note" || item?.note_id ? item?.linked_echo_id : null);

        if (relatedEchoId && clusterByEchoId[relatedEchoId]) {
          clusterRef = clusterByEchoId[relatedEchoId];
        } else {
          const relatedNoteId = String(
            item?.note_id || (item?.type === "note" ? item?.id : ""),
          );
          const linkedEchoIds = relatedNoteId
            ? linkedEchoIdsByNoteId[relatedNoteId] || []
            : [];
          const firstLinkedEchoId = linkedEchoIds[0];
          if (firstLinkedEchoId && clusterByEchoId[firstLinkedEchoId]) {
            clusterRef = clusterByEchoId[firstLinkedEchoId];
          } else if (relatedNoteId && clusterByNoteId[relatedNoteId]) {
            clusterRef = clusterByNoteId[relatedNoteId];
          }
        }

        if (!clusterRef) return;

        const clusterId = clusterRef.id || clusterRef.cluster_id;
        const rootId = rootClusterIdByClusterId[clusterId] || clusterId;
        if (rootId) relatedRootIds.add(String(rootId));
      });

      relatedRootIds.forEach((rootId) =>
        appendArchiveDisplayParent(rootId, archiveGroup),
      );
    });

    return {
      clustersById,
      stacksById,
      groupsById,
      archiveGroupsById,
      archiveGroupsByDisplayParentId,
      rootClusterIdByClusterId,
      clusterByEchoId,
      clusterByNoteId,
      groupByItemId,
      groupContentsById,
      archiveStateByItemId,
      archiveContextByItemId,
      echoesById,
      notesById,
      notesByLinkedEchoId,
      groupsByOwnerId,
      linkedEchoIdsByNoteId,
      linkedNoteIdsByEchoId,
      linkedNoteIdsByNoteId,
      linkedItemIdsByItemId,
      manualLinkKeySet,
      linkSummaryByItemId,
    };
  }, [clusters, stacks, groups, allNotes, manualLinks]);

  // 2. BASE DATASET AGGREGATION
  const rawLoopDataset = useMemo(() => {
    if (canvasMode === "ECHO") {
      if (!clusters || clusters.length === 0) return [];
      const getClusterId = (cluster: any) =>
        String(cluster?.id || cluster?.cluster_id || "");
      const getColumnMetadata = (cluster: any) =>
        cluster?.column_metadata && typeof cluster.column_metadata === "object"
          ? cluster.column_metadata
          : {};
      const getColumnKind = (cluster: any) =>
        String(getColumnMetadata(cluster).column_kind || "").toLowerCase();
      const isDerivedCluster = (cluster: any) => {
        const columnKind = getColumnKind(cluster);
        return columnKind === "analysis" || columnKind === "rag";
      };

      const getUltimateRootId = (clusterId: string): string => {
        const cluster = indexes.clustersById[clusterId];
        if (!cluster) return clusterId;
        if (!cluster.parent_cluster_id) return cluster.id || cluster.cluster_id;
        return getUltimateRootId(cluster.parent_cluster_id);
      };

      const resolveDerivedParentRootId = (cluster: any): string => {
        const metadata = getColumnMetadata(cluster);
        const directParentId = String(cluster?.parent_cluster_id || "").trim();
        if (directParentId) {
          return getUltimateRootId(directParentId);
        }

        const anchorCandidates = [
          ...(metadata?.source_anchor_ids || []),
          ...(metadata?.source_echo_ids || []),
          metadata?.origin_context?.cluster_id,
          metadata?.origin_context?.echo_id,
          cluster?.source_echo_id,
        ]
          .map((value: any) => String(value || "").trim())
          .filter(Boolean);

        for (const candidate of anchorCandidates) {
          if (indexes.clustersById[candidate]) {
            return getUltimateRootId(candidate);
          }
          const sourceCluster = indexes.clusterByEchoId[candidate];
          if (sourceCluster) {
            return getUltimateRootId(getClusterId(sourceCluster));
          }
        }

        return "";
      };

      const getDisplayRootId = (cluster: any): string => {
        const clusterId = getClusterId(cluster);
        if (!clusterId) return "";

        const rootId = getUltimateRootId(clusterId);
        const rootCluster = indexes.clustersById[rootId];
        if (rootCluster && isDerivedCluster(rootCluster)) {
          return resolveDerivedParentRootId(rootCluster) || rootId;
        }
        return rootId;
      };

      const buildDerivedSlotCard = (cluster: any) => {
        const clusterId = getClusterId(cluster);
        const metadata = getColumnMetadata(cluster);
        const mode = String(metadata.mode || "").toLowerCase();
        const latestSummaryChunk = [...(cluster.chunks || [])]
          .reverse()
          .find(
            (chunk: any) =>
              String(
                chunk?.bridge ||
                  chunk?.ai_insight ||
                  chunk?.text ||
                  chunk?.title ||
                  "",
              ).trim().length > 0,
          );
        const originContext =
          metadata.origin_context || metadata.source_contexts?.[0] || {};
        const previewText = String(
          latestSummaryChunk?.bridge ||
            latestSummaryChunk?.ai_insight ||
            latestSummaryChunk?.text ||
            originContext?.text ||
            "",
        ).trim();
        const title = String(
          cluster?.title ||
            latestSummaryChunk?.title ||
            metadata.mode_label ||
            (mode === "rag" ? "RAG Result" : "Analysis Result"),
        ).trim();
        const sizeTag = mode === "rag" ? "size:A5" : "size:A4";
        const existingTags = String(latestSummaryChunk?.tags || "").trim();

        return {
          ...cluster,
          chunk_id: `derived_${clusterId}`,
          echo_id: `derived_${clusterId}`,
          type: "echo",
          relation: mode === "rag" ? "RAG Result" : "Analysis Result",
          title,
          bridge: title,
          text: previewText || "No summary available yet.",
          chapter: String(originContext?.chapter || ""),
          tags: [existingTags, sizeTag, "spatial:derived_card"]
            .filter(Boolean)
            .join(" ")
            .trim(),
          source_cluster_id: clusterId,
          analysis_mode: mode,
          column_metadata: metadata,
          is_saved_result_card: true,
        };
      };

      const mergedRootsById = new Map<string, any>();
      const ensureMergedRoot = (cluster: any) => {
        const clusterId = getClusterId(cluster);
        if (!clusterId) return null;
        if (!mergedRootsById.has(clusterId)) {
          mergedRootsById.set(clusterId, {
            ...cluster,
            chunks: [...(cluster.chunks || [])],
          });
        }
        return mergedRootsById.get(clusterId);
      };

      const attachDerivedCardToRoot = (rootId: string, cluster: any) => {
        if (!rootId) return false;
        const rootCluster = indexes.clustersById[rootId];
        if (!rootCluster) return false;

        const root = ensureMergedRoot(rootCluster);
        if (!root) return false;

        const derivedCard = buildDerivedSlotCard(cluster);
        const alreadyPresent = (root.chunks || []).some(
          (item: any) =>
            String(item?.source_cluster_id || "") ===
            String(derivedCard.source_cluster_id || ""),
        );
        if (!alreadyPresent) {
          root.chunks.push(derivedCard);
        }
        return true;
      };

      const roots = clusters.filter((cluster) => !cluster.parent_cluster_id);
      roots.forEach((root) => {
        const rootId = getClusterId(root);
        const displayRootId = getDisplayRootId(root);
        if (displayRootId && displayRootId !== rootId && isDerivedCluster(root)) {
          return;
        }
        ensureMergedRoot(root);
      });

      clusters.forEach((cluster) => {
        const clusterId = getClusterId(cluster);
        if (!clusterId) return;

        if (isDerivedCluster(cluster)) {
          const displayRootId = getDisplayRootId(cluster);
          if (displayRootId && displayRootId !== clusterId) {
            attachDerivedCardToRoot(displayRootId, cluster);
            return;
          }
          if (!cluster.parent_cluster_id) {
            ensureMergedRoot(cluster);
          }
          return;
        }

        if (!cluster.parent_cluster_id) return;

        const displayRootId = getDisplayRootId(cluster);
        const displayRoot = indexes.clustersById[displayRootId];
        if (displayRoot) {
          ensureMergedRoot(displayRoot)?.chunks.push(...(cluster.chunks || []));
          return;
        }

        ensureMergedRoot(cluster);
      });

      const mergedRoots = Array.from(mergedRootsById.values());
      mergedRoots.forEach((root) => {
        root.chunks.sort(
          (a: any, b: any) =>
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime(),
        );
      });
      mergedRoots.sort(
        (a: any, b: any) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      const finalDisplayNodes: any[] = [];
      const archiveMap = new Map<string, any>();

      mergedRoots.forEach((root) => {
        if (root.archive_group_id) {
          if (!archiveMap.has(root.archive_group_id)) {
            archiveMap.set(root.archive_group_id, {
              id: root.archive_group_id,
              stack_id: root.archive_group_id,
              is_archive_node: true,
              is_outer: true,
              type: "archive_folder",
              relation: "Folder",
              title: root.archive_group_title || "Archived Items",
              x_pos: root.x_pos || 0,
              y_pos: root.y_pos || 0,
              chunks: [],
            });
          }
          archiveMap
            .get(root.archive_group_id)
            .chunks.push({ ...root, type: "cluster" });
        } else {
          finalDisplayNodes.push(root);
        }
      });
      archiveMap.forEach((archNode) => finalDisplayNodes.push(archNode));

      return finalDisplayNodes;
    } else {
      if (!stacks || stacks.length === 0) return [];
      const finalDisplayNodes: any[] = [];
      const archiveMap = new Map<string, any>();
      const mutableStacks = [...stacks].sort(
        (a: any, b: any) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      // 2. NOTES MODE LOOP
      mutableStacks.forEach((stack: any) => {
        if (stack.archive_group_id) {
          if (!archiveMap.has(stack.archive_group_id)) {
            archiveMap.set(stack.archive_group_id, {
              stack_id: stack.archive_group_id,
              id: stack.archive_group_id,
              is_archive_node: true,
              is_outer: true,
              type: "archive_folder",
              relation: "Folder",
              title: stack.archive_group_title || "Archived Notes",
              // ✨ THE FIX: Anchor the folder to the canvas coordinates!
              x_pos: stack.x_pos || 0,
              y_pos: stack.y_pos || 0,
              chunks: [],
            });
          }
          archiveMap
            .get(stack.archive_group_id)
            .chunks.push({ ...stack, type: "stack" });
        } else {
          finalDisplayNodes.push(stack);
        }
      });

      archiveMap.forEach((archNode) => finalDisplayNodes.push(archNode));
      return finalDisplayNodes;
    }
  }, [clusters, stacks, canvasMode, indexes.clustersById, indexes.clusterByEchoId]);

  // 3. VIRTUAL VAULT INJECTION
  const loopDataset = useMemo(() => {
    if (canvasMode !== "NOTES") return rawLoopDataset;

    const filteredDataset = rawLoopDataset.filter(
      (item: any) => !item.archive_group_id || item.stack_id === rootExpandedId,
    );

    const archivedStacksMap = new Map<string, any>();
    stacks.forEach((s: any) => {
      if (s.archive_group_id && s.stack_id !== rootExpandedId) {
        if (!archivedStacksMap.has(s.archive_group_id)) {
          archivedStacksMap.set(s.archive_group_id, {
            stack_id: s.archive_group_id,
            is_archive_node: false,
            is_outer: true,
            type: "archive_folder",
            relation: "Folder",
            title: s.archive_group_title || "Archived Notes",
            chunks: [],
          });
        }
        archivedStacksMap
          .get(s.archive_group_id)
          .chunks.push({ ...s, type: "stack" });
      }
    });

    const archivedClustersMap = new Map<string, any>();
    clusters.forEach((c: any) => {
      if (c.archive_group_id && c.id !== rootExpandedId) {
        if (!archivedClustersMap.has(c.archive_group_id)) {
          archivedClustersMap.set(c.archive_group_id, {
            stack_id: c.archive_group_id,
            id: c.archive_group_id,
            is_archive_node: false,
            is_outer: true,
            type: "cluster",
            relation: "Folder",
            title: c.archive_group_title || "Archived Items",
            chunks: [],
          });
        }
        archivedClustersMap
          .get(c.archive_group_id)
          .chunks.push({ ...c, type: "cluster", stack_id: c.id });
      }
    });

    const archivedGroups = groups
      .filter((g: any) => g.group_kind === "archive")
      .filter((g: any) => {
        const parentStack = indexes.stacksById[g.owner_item_id];
        if (parentStack && parentStack.archive_group_id) return false;
        const parentCluster = indexes.clustersById[g.owner_item_id];
        if (parentCluster && parentCluster.archive_group_id) return false;
        return true;
      })
      .map((g: any) => {
        const parentStack = indexes.stacksById[g.owner_item_id];
        return {
          ...g,
          is_inner: true,
          type: "group",
          relation: "Folder",
          locationTag: parentStack ? parentStack.title : "Unknown Stack",
          original_stack_id: g.owner_item_id,
          stack_id: g.group_id,
        };
      });

    const archiveChildren = [
      ...Array.from(archivedStacksMap.values()),
      ...Array.from(archivedClustersMap.values()),
      ...archivedGroups,
    ];

    if (archiveChildren.length > 0) {
      filteredDataset.push({
        stack_id: "GLOBAL_ARCHIVE_VAULT",
        is_archive_node: false,
        title: "Archive Vault",
        chunks: archiveChildren,
      });
    }

    return filteredDataset;
  }, [
    rawLoopDataset,
    canvasMode,
    stacks,
    groups,
    clusters,
    rootExpandedId,
    indexes.stacksById,
    indexes.clustersById,
  ]);

  return {
    rawLoopDataset,
    loopDataset,
    clustersById: indexes.clustersById,
    stacksById: indexes.stacksById,
    groupsById: indexes.groupsById,
    archiveGroupsById: indexes.archiveGroupsById,
    archiveGroupsByDisplayParentId: indexes.archiveGroupsByDisplayParentId,
    archiveStateByItemId: indexes.archiveStateByItemId,
    archiveContextByItemId: indexes.archiveContextByItemId,
    groupByItemId: indexes.groupByItemId,
    groupContentsById: indexes.groupContentsById,
    echoesById: indexes.echoesById,
    notesById: indexes.notesById,
    notesByLinkedEchoId: indexes.notesByLinkedEchoId,
    linkedEchoIdsByNoteId: indexes.linkedEchoIdsByNoteId,
    linkedNoteIdsByEchoId: indexes.linkedNoteIdsByEchoId,
    linkedNoteIdsByNoteId: indexes.linkedNoteIdsByNoteId,
    linkedItemIdsByItemId: indexes.linkedItemIdsByItemId,
    manualLinkKeySet: indexes.manualLinkKeySet,
    linkSummaryByItemId: indexes.linkSummaryByItemId,
    groupsByOwnerId: indexes.groupsByOwnerId,
  };
}
