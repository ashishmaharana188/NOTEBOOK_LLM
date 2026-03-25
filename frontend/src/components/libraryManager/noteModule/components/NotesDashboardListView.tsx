import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  FolderIcon,
  RectangleStackIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

export default function NotesDashboardListView({
  stacks = [],
  groups = [],
  notesByGroup = {},
  activeGroupId = null,
  highlightedGroupId = null,
  onOpenGroup,
  onOpenNote,
  onInitiateCreateNote,
  fetchNotesForGroup,
}: any) {
  const [expandedStackIds, setExpandedStackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  const groupsByStackId = useMemo(() => {
    const next: Record<string, any[]> = {};
    groups.forEach((group: any) => {
      const stackId = String(group.stack_id || "");
      if (!stackId) return;
      if (!next[stackId]) next[stackId] = [];
      next[stackId]!.push(group);
    });
    Object.values(next).forEach((items: any) =>
      items.sort((a: any, b: any) => a.title.localeCompare(b.title)),
    );
    return next;
  }, [groups]);

  useEffect(() => {
    if (!activeGroupId) return;
    const activeGroup = groups.find(
      (group: any) => String(group.group_id) === String(activeGroupId),
    );
    if (!activeGroup) return;

    setExpandedStackIds((prev) => {
      if (prev.has(activeGroup.stack_id)) return prev;
      const next = new Set(prev);
      next.add(activeGroup.stack_id);
      return next;
    });
    setExpandedGroupIds((prev) => {
      if (prev.has(activeGroup.group_id)) return prev;
      const next = new Set(prev);
      next.add(activeGroup.group_id);
      return next;
    });
  }, [activeGroupId, groups]);

  const toggleStack = (stackId: string) => {
    setExpandedStackIds((prev) => {
      const next = new Set(prev);
      if (next.has(stackId)) next.delete(stackId);
      else next.add(stackId);
      return next;
    });
  };

  const toggleGroup = async (groupId: string) => {
    const isOpen = expandedGroupIds.has(groupId);

    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

    if (!isOpen) {
      onOpenGroup?.(groupId);
      if (!notesByGroup[groupId]) {
        await fetchNotesForGroup?.(groupId);
      }
    }
  };

  if (!stacks.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-sm font-medium text-slate-400">
        No stacks found. Create one to start your notes workspace.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4  ">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Notes Hierarchy
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900">
            Stacks, folders, and notes
          </h2>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {stacks.length} stacks
        </div>
      </div>

      <div className="space-y-4 p-5">
        {stacks.map((stack: any) => {
          const stackId = String(stack.stack_id);
          const stackGroups = groupsByStackId[stackId] || [];
          const isExpanded = expandedStackIds.has(stackId);

          return (
            <section
              key={stackId}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80"
            >
              <button
                type="button"
                onClick={() => toggleStack(stackId)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-100"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                    <RectangleStackIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-900">
                      {stack.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-500">
                      {stackGroups.length} folders
                    </p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-3 border-t border-slate-200 bg-white p-4">
                  {stackGroups.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">
                      No folders in this stack.
                    </div>
                  )}

                  {stackGroups.map((group: any) => {
                    const groupId = String(group.group_id);
                    const isGroupExpanded = expandedGroupIds.has(groupId);
                    const groupNotes = notesByGroup[groupId] || [];
                    const isHighlighted =
                      String(highlightedGroupId || "") === groupId;
                    const isActive = String(activeGroupId || "") === groupId;

                    return (
                      <div
                        key={groupId}
                        className={`overflow-hidden rounded-2xl border ${
                          isHighlighted || isActive
                            ? "border-blue-300 bg-blue-50/60"
                            : "border-slate-200 bg-slate-50/70"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup(groupId)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            {isGroupExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                              <FolderIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-black text-slate-900">
                                {group.title}
                              </h4>
                              <p className="text-[11px] font-medium text-slate-500">
                                {groupNotes.length} loaded notes
                              </p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => onInitiateCreateNote?.(groupId)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            <PlusIcon className="h-3.5 w-3.5" />
                            Note
                          </button>
                        </div>

                        {isGroupExpanded && (
                          <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3">
                            {!notesByGroup[groupId] && (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
                                Loading notes...
                              </div>
                            )}

                            {notesByGroup[groupId] &&
                              groupNotes.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
                                  No notes in this folder.
                                </div>
                              )}

                            {groupNotes.map((note: any) => (
                              <button
                                key={note.note_id}
                                type="button"
                                onClick={() => onOpenNote?.(note)}
                                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                              >
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
                                  <DocumentTextIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <h5 className="truncate text-sm font-bold text-slate-900">
                                    {note.title || "Untitled Note"}
                                  </h5>
                                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                    {String(note.content || "")
                                      .replace(/<[^>]*>/g, " ")
                                      .replace(/\s+/g, " ")
                                      .trim() || "No preview available."}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
