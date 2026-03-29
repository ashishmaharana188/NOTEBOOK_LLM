import { useMemo } from "react";

const STABLE_EMPTY_CONTENTS: Record<string, any[]> = {};
const STABLE_EMPTY_OBJECT: Record<string, any> = {};

export default function useOrbitingItems({
  isNotesMode,
  activeFolder,
  cluster,
  noteStack,
  drillDownPath,
  itemId,
  archiveGroupsById = STABLE_EMPTY_OBJECT,
  archiveStateByItemId = STABLE_EMPTY_OBJECT,
  groupContentsById = STABLE_EMPTY_CONTENTS,
  echoesById = STABLE_EMPTY_OBJECT,
  notesByLinkedEchoId = STABLE_EMPTY_CONTENTS,
  linkedEchoIdsByNoteId = STABLE_EMPTY_CONTENTS,
  groupsByOwnerId = STABLE_EMPTY_CONTENTS,
  archiveGroupsByDisplayParentId = STABLE_EMPTY_CONTENTS,
}: any) {
  return useMemo(() => {
    const items: any[] = [];
    const currentExpandedId =
      drillDownPath && drillDownPath.length > 0
        ? drillDownPath[drillDownPath.length - 1]
        : itemId;
    const isRoot = currentExpandedId === itemId;

    const isExplicitEchoManualNote = (item: any) =>
      String(item?.tags || "").includes("manual_canvas:1");

    const getScopedFolderContents = (groupId: string) =>
      groupContentsById?.[groupId] || [];

    const getStableItemId = (item: any, fallback = "item") =>
      String(
        item?.note_id ||
          item?.echo_id ||
          item?.chunk_id ||
          item?.group_id ||
          item?.id ||
          fallback,
      );

    const sortByCreatedAt = (contents: any[]) =>
      [...(contents || [])].sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return getStableItemId(a).localeCompare(getStableItemId(b));
      });

    const buildArchiveFolderNode = (group: any) => ({
      ...group,
      chunk_id: String(group.group_id),
      relation: "Folder",
      type: "folder",
      is_folder: true,
      bridge: group.title || "Archived Folder",
      preview_items: getScopedFolderContents(group.group_id),
    });

    const buildFolderPreviewHTML = (contents: any[]) => {
      if (!contents || contents.length === 0) {
        return `<p class="text-slate-400 italic text-sm mt-2">Empty Folder</p>`;
      }

      let previewHTML = contents
        .slice(0, 5)
        .map(
          (item: any) =>
            `<div class="border-b border-slate-200/60 pb-2 mb-2"><strong class="text-slate-700 text-sm tracking-tight">${item.title || item.bridge || "Untitled"}</strong></div>`,
        )
        .join("");

      if (contents.length > 5) {
        previewHTML += `<div class="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-3">+ ${contents.length - 5} more items</div>`;
      }

      return previewHTML;
    };

    const contextInnerArchives = (
      archiveGroupsByDisplayParentId?.[currentExpandedId] || []
    ).map(buildArchiveFolderNode);

    // --- 1. GLOBAL VAULT INTERCEPTOR (LEVEL 1) ---
    if (
      itemId === "GLOBAL_ARCHIVE_VAULT" &&
      (drillDownPath?.length || 1) === 1
    ) {
      return (noteStack?.chunks || []).map((archive: any) => {
        let previews: any[] = [];
        if (archive.type === "archive_folder" || archive.is_outer) {
          previews = archive.chunks || [];
        } else if (
          archive.type === "group" &&
          archive.group_kind === "archive"
        ) {
          const targetId = archive.group_id;
          previews = groupContentsById?.[targetId] || [];
        }
        return {
          ...archive,
          chunk_id: archive.stack_id || archive.id || archive.group_id,
          relation: "Folder",
          type: archive.type || "archive_folder",
          is_folder: true,
          bridge: archive.title || "Archived Folder",
          preview_items: previews,
        };
      });
    }

    const isGlobalVaultOuter =
      itemId === "GLOBAL_ARCHIVE_VAULT" &&
      (activeFolder?.is_outer || activeFolder?.type === "archive_folder");

    // ✨ THE FIX: Explicitly ignore Canvas Inner Archives here so they don't get processed as Outer Archives
    const activeOuterArchive = isGlobalVaultOuter
      ? activeFolder
      : cluster?.is_archive_node && !cluster?.is_orphan_inner
        ? cluster
        : null;

    if (activeOuterArchive) {
      const isEchoModeArchive = !!cluster?.is_archive_node;
      const targetDepthForSlots = isEchoModeArchive ? 1 : 2;
      const targetDepthForItems = isEchoModeArchive ? 2 : 3;
      const depth = drillDownPath?.length || 1;

      if (depth === targetDepthForSlots) {
        const level2Items: any[] = [];
        const stacksInArchive = activeOuterArchive.chunks || [];

        stacksInArchive.forEach((stackSlot: any) => {
          const stackId = stackSlot.stack_id || stackSlot.id;
          const allGroupsForStack = groupsByOwnerId[stackId] || [];

          const innerArchives = allGroupsForStack.filter(
            (g: any) => g.group_kind === "archive",
          );
          const standardGroups = allGroupsForStack.filter(
            (g: any) => g.group_kind !== "archive",
          );
          const standardGroupIds = standardGroups.map((g: any) =>
            String(g.group_id),
          );

          let stackPreviews: any[] = [];
          if (stackSlot.type === "stack") {
            standardGroupIds.forEach((gId: string) => {
              const contents = groupContentsById[gId] || [];
              stackPreviews.push(
                ...contents.filter(
                  (n: any) => archiveStateByItemId?.[n.note_id] !== "inner",
                ),
              );
            });
          } else if (stackSlot.type === "cluster" || stackSlot.chunks) {
            stackPreviews = (stackSlot.chunks || []).filter(
              (c: any) => archiveStateByItemId?.[c.echo_id] !== "inner",
            );
          }

          level2Items.push({
            ...stackSlot,
            chunk_id: stackId,
            relation: "Folder",
            type: "folder",
            is_folder: true,
            bridge: stackSlot.title || "Slot",
            preview_items: stackPreviews,
          });

          innerArchives.forEach((innerArch: any) => {
            const targetGroupId = innerArch.group_id;
            const archPreviews = getScopedFolderContents(targetGroupId);
            level2Items.push({
              ...innerArch,
              chunk_id: targetGroupId,
              relation: "Folder",
              type: "folder",
              is_folder: true,
              bridge: innerArch.title || "Archived Folder",
              preview_items: archPreviews,
              locationTag: stackSlot.title,
            });
          });
        });
        return level2Items;
      }

      if (depth === targetDepthForItems) {
        const slotId = drillDownPath[targetDepthForItems - 1];
        let rawChunks: any[] = [];

        const groupContents = groupContentsById[slotId];
        if (groupContents) {
          rawChunks = groupContents || [];
        } else {
          const slot = (activeOuterArchive.chunks || []).find(
            (s: any) => String(s.stack_id || s.id) === String(slotId),
          );
          if (slot) {
            if (slot.type === "stack") {
              const standardGroupIds = (groupsByOwnerId[slotId] || [])
                .filter((g: any) => g.group_kind !== "archive")
                .map((g: any) => String(g.group_id));

              standardGroupIds.forEach((gId: string) => {
                const contents = groupContentsById[gId] || [];
                rawChunks.push(
                  ...contents.filter(
                    (n: any) => archiveStateByItemId?.[n.note_id] !== "inner",
                  ),
                );
              });
            } else if (slot.type === "cluster" || slot.chunks) {
              rawChunks = (slot.chunks || []).filter(
                (c: any) => archiveStateByItemId?.[c.echo_id] !== "inner",
              );
            }
          }
        }

        return rawChunks.map((c: any, index: number) => {
          const out = { ...c };
          if (!out.chunk_id)
            out.chunk_id = String(
              c.echo_id ||
                c.note_id ||
                c.chunk_id ||
                c.id ||
                `slot-item-${index}`,
            );
          return out;
        });
      }
    }

    // --- 3. INNER ARCHIVE DIRECT OPEN ---
    const standardInnerArchiveId =
      currentExpandedId !== itemId && archiveGroupsById?.[currentExpandedId]
        ? currentExpandedId
        : null;

    if (standardInnerArchiveId) {
      const rawChunks = getScopedFolderContents(standardInnerArchiveId);

      return rawChunks.map((c: any, index: number) => {
        const out = { ...c };
        if (!out.chunk_id)
          out.chunk_id = String(
            c.echo_id ||
              c.note_id ||
              c.chunk_id ||
              c.id ||
              `direct-archive-item-${index}`,
          );
        return out;
      });
    }

    // --- 4. INNER ARCHIVE DIRECT OPEN (ORPHAN INNER) ---
    const isVaultOrphan =
      itemId === "GLOBAL_ARCHIVE_VAULT" &&
      activeFolder &&
      !activeFolder.is_outer &&
      activeFolder.type !== "archive_folder";

    // ✨ THE FIX: Allow Canvas Inner Archives to trigger the direct-open logic!
    const isCanvasOrphan = cluster?.is_archive_node && cluster?.is_orphan_inner;

    if (isVaultOrphan || isCanvasOrphan) {
      const targetId = isVaultOrphan ? activeFolder.group_id : cluster.id;
      const rawChunks = getScopedFolderContents(targetId);

      return rawChunks.map((c: any, index: number) => {
        const out = { ...c };
        if (!out.chunk_id)
          out.chunk_id = String(
            c.echo_id ||
              c.note_id ||
              c.chunk_id ||
              c.id ||
              `archived-item-${index}`,
          );
        return out;
      });
    }

    // --- 5. STANDARD MODES ---
    if (!isNotesMode) {
      const rawChunks = cluster?.chunks || [];
      const echoes = rawChunks.filter(
        (c: any) => c.type !== "note" && !c.note_id,
      );

      const echoIds = echoes.map((e: any) => String(e.echo_id));
      const layoutNotes = rawChunks.filter(
        (c: any) =>
          (c.type === "note" || c.note_id) &&
          (((linkedEchoIdsByNoteId?.[String(c.note_id || c.chunk_id)] || []).some(
            (linkedId: string) => echoIds.includes(String(linkedId)),
          )) ||
            isExplicitEchoManualNote(c)),
      );

      const linkedNotes: any[] = [];
      echoIds.forEach((id: string) => {
        if (notesByLinkedEchoId[id])
          linkedNotes.push(...notesByLinkedEchoId[id]);
      });

      const mergedNotesMap = new Map();
      layoutNotes.forEach((n: any) =>
        mergedNotesMap.set(String(n.note_id || n.chunk_id), n),
      );
      linkedNotes.forEach((n: any) => {
        if (!mergedNotesMap.has(String(n.note_id)))
          mergedNotesMap.set(String(n.note_id), n);
      });
      const allRelevantNotes = Array.from(mergedNotesMap.values()).map(
        (n: any) => ({
          ...n,
          chunk_id: String(n.note_id || n.chunk_id),
          relation: "User Note",
          type: "note",
          bridge: n.title,
          text: n.text || n.content,
        }),
      );

      const targetGroupId = isRoot ? null : currentExpandedId;

      const clusterSubArchiveIds = (groupsByOwnerId[itemId] || []).map(
        (g: any) => String(g.group_id),
      );

      const levelEchoes = echoes.filter(
        (e: any) =>
          archiveStateByItemId?.[e.echo_id] !== "inner" &&
          archiveStateByItemId?.[e.echo_id] !== "outer" &&
          (isRoot
            ? !e.group_id || !clusterSubArchiveIds.includes(String(e.group_id))
            : String(e.group_id) === String(targetGroupId)),
      );

      const levelNotes = allRelevantNotes.filter(
        (n: any) =>
          archiveStateByItemId?.[n.note_id || n.chunk_id] !== "inner" &&
          archiveStateByItemId?.[n.note_id || n.chunk_id] !== "outer" &&
          (isRoot
            ? !n.group_id || !clusterSubArchiveIds.includes(String(n.group_id))
            : String(n.group_id) === String(targetGroupId)),
      );

      const directFolderNotes = !isRoot
        ? getScopedFolderContents(targetGroupId)
            .filter(
              (n: any) =>
                (n.type === "note" || n.note_id) &&
                archiveStateByItemId?.[n.note_id || n.chunk_id] !== "inner" &&
                archiveStateByItemId?.[n.note_id || n.chunk_id] !== "outer",
            )
            .map((n: any) => ({
              ...n,
              chunk_id: String(n.note_id || n.chunk_id),
              relation: "User Note",
              type: "note",
              bridge: n.title,
              text: n.text || n.content,
            }))
        : [];

      const linkedFolderNotes = !isRoot
        ? levelEchoes.flatMap((echo: any) =>
            (notesByLinkedEchoId?.[String(echo.echo_id)] || [])
              .filter(
                (n: any) =>
                  archiveStateByItemId?.[n.note_id || n.chunk_id] !== "inner" &&
                  archiveStateByItemId?.[n.note_id || n.chunk_id] !== "outer",
              )
              .map((n: any) => ({
                ...n,
                chunk_id: String(n.note_id || n.chunk_id),
                relation: "User Note",
                type: "note",
                bridge: n.title,
                text: n.text || n.content,
              })),
          )
        : [];

      const visibleLevelNotes = isRoot
        ? levelNotes
        : Array.from(
            new Map(
              [...directFolderNotes, ...linkedFolderNotes].map((note: any) => [
                String(note.note_id || note.chunk_id),
                note,
              ]),
            ).values(),
          );

      const pushedNoteIds = new Set();
      levelEchoes.forEach((echo: any) => {
        items.push(echo);
        const childNotes = visibleLevelNotes.filter(
          (n: any) =>
            (linkedEchoIdsByNoteId?.[String(n.note_id || n.chunk_id)] || []).includes(
              String(echo.echo_id),
            ) &&
            !pushedNoteIds.has(n.chunk_id),
        );
        childNotes.forEach((n: any) => pushedNoteIds.add(n.chunk_id));
        items.push(...childNotes);
      });
      visibleLevelNotes.forEach((n: any) => {
        if (!pushedNoteIds.has(n.chunk_id)) {
          items.push(n);
          pushedNoteIds.add(n.chunk_id);
        }
      });

      if (isRoot) {
        const standardSubFolders = (groupsByOwnerId[itemId] || [])
          .filter((g: any) => g.group_kind !== "archive")
          .map((g: any) => {
            const previewChunks = getScopedFolderContents(g.group_id);
            return {
              ...g,
              chunk_id: String(g.group_id),
              relation: "Folder",
              type: "folder",
              is_folder: true,
              bridge: g.title || "Folder",
              preview_items: previewChunks,
            };
          });
        items.push(...standardSubFolders);
      }

      items.push(...contextInnerArchives);
    } else if (isNotesMode && !activeFolder) {
      const stackFolders = (groupsByOwnerId[itemId] || []).filter(
        (g: any) => g.group_kind !== "archive",
      );

      const folders = stackFolders
        .map((g: any) => {
          const allFolderContents = (groupContentsById?.[g.group_id] || []).filter(
            (c: any) =>
              archiveStateByItemId?.[c.note_id || c.echo_id] !== "inner" &&
              archiveStateByItemId?.[c.note_id || c.echo_id] !== "outer",
          );

          return {
            ...g,
            chunk_id: String(g.group_id),
            relation: "Folder",
            type: "folder",
            is_folder: false, // Normal folders behave like cards until expanded
            bridge: g.title,
            text: buildFolderPreviewHTML(allFolderContents),
            preview_items: allFolderContents,
          };
        });

      const stackNotes = stackFolders.flatMap((g: any) =>
        (groupContentsById?.[g.group_id] || []).filter(
          (item: any) =>
            (item.type === "note" || item.note_id) &&
            archiveStateByItemId?.[item.note_id || item.chunk_id] !== "inner" &&
            archiveStateByItemId?.[item.note_id || item.chunk_id] !== "outer",
        ),
      );

      const rootLinkedEchoIds = Array.from(
        new Set(
          stackNotes.flatMap((note: any) =>
            (linkedEchoIdsByNoteId?.[String(note.note_id || note.chunk_id)] || []).map(
              (echoId: string) => String(echoId),
            ),
          ),
        ),
      );

      const rootLinkedEchoes = rootLinkedEchoIds
        .map((echoId: string) => echoesById?.[echoId])
        .filter(
          (echo: any) =>
            echo &&
            archiveStateByItemId?.[echo.echo_id || echo.chunk_id] !== "inner" &&
            archiveStateByItemId?.[echo.echo_id || echo.chunk_id] !== "outer",
        )
        .map((echo: any) => ({
          ...echo,
          chunk_id: String(echo.echo_id || echo.chunk_id),
          relation: "AI Echo",
          type: "echo",
        }));

      items.push(...folders);
      items.push(...rootLinkedEchoes);
      items.push(...contextInnerArchives);
    } else if (isNotesMode && activeFolder) {
      const activeContents = sortByCreatedAt(
        groupContentsById?.[activeFolder.group_id] || [],
      ).filter(
        (c: any) =>
          archiveStateByItemId?.[c.note_id || c.echo_id] !== "inner" &&
          archiveStateByItemId?.[c.note_id || c.echo_id] !== "outer",
      );

      const activeEchoIds = new Set(
        activeContents
          .filter((c: any) => c.type === "echo" || c.echo_id)
          .map((c: any) => String(c.echo_id || c.chunk_id)),
      );

      const linkedEchoIds = Array.from(new Set(
        activeContents
          .filter((c: any) => c.type === "note" || c.note_id)
          .flatMap((n: any) =>
            (linkedEchoIdsByNoteId?.[String(n.note_id || n.chunk_id)] || []).map(
              (echoId: string) => String(echoId),
            ),
          )
          .filter((id: string) => !activeEchoIds.has(id)),
      ));

      const linkedEchoes: any[] = [];
      linkedEchoIds.forEach((id) => {
        const echo = echoesById[id];
        if (echo && !linkedEchoes.find((e: any) => String(e.echo_id) === id)) {
          if (
            archiveStateByItemId?.[id] !== "inner" &&
            archiveStateByItemId?.[id] !== "outer"
          ) {
            linkedEchoes.push({
              ...echo,
              chunk_id: id,
              relation: "AI Echo",
              type: "echo",
            });
          }
        }
      });

      const pushedItemIds = new Set<string>();
      activeContents.forEach((item: any, index: number) => {
        const formattedItem = {
          ...item,
          chunk_id: String(
            item.note_id || item.echo_id || `active-item-${index}`,
          ),
          relation: item.type === "note" ? "User Note" : "AI Echo",
          bridge: item.title,
          text: item.content || item.text || item.ai_insight,
        };
        const formattedItemId = getStableItemId(formattedItem, `active-${index}`);
        if (!pushedItemIds.has(formattedItemId)) {
          items.push(formattedItem);
          pushedItemIds.add(formattedItemId);
        }
      });

      linkedEchoes.forEach((echo: any, index: number) => {
        const parentEchoId = getStableItemId(echo, `echo-${index}`);
        if (!pushedItemIds.has(parentEchoId)) {
          items.push(echo);
          pushedItemIds.add(parentEchoId);
        }
      });

      items.push(...contextInnerArchives);
    }

    return items || [];
  }, [
    isNotesMode,
    activeFolder,
    cluster,
    noteStack,
    drillDownPath,
    itemId,
    archiveStateByItemId,
    groupContentsById,
    echoesById,
    notesByLinkedEchoId,
    linkedEchoIdsByNoteId,
    groupsByOwnerId,
    archiveGroupsById,
    archiveGroupsByDisplayParentId,
  ]);
}
