import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import axios from "axios";
import { useRefreshBus } from "../../components/system/RefreshBusProvider";
import { API_BASE_URL } from "../../lib/runtimeConfig";

const API_BASE = API_BASE_URL;

export interface NoteStack {
    stack_id: string;
    title: string;
    created_at?: string;
    archive_group_id?: string | null;
}

export interface NoteGroup {
    group_id: string;
    stack_id: string;
    title: string;
    linked_book_id?: string;
    created_at?: string;
    group_kind?: "regular" | "archive";
    owner_item_id?: string | null;
    owner_item_type?: "stack" | "cluster" | "group" | null;
    display_parent_id?: string | null;
    restore_group_id?: string | null;
}

export interface NoteItem {
    note_id: string;
    group_id: string | null;
    title: string;
    content: string;
    tags: string;
    linked_echo_id?: string;
    created_at?: string;
}

type NotesScopeId = string;

interface NotesContextValue {
    stacks: NoteStack[];
    groups: NoteGroup[];
    notesByGroup: Record<string, NoteItem[]>;
    activeGroupByScope: Record<NotesScopeId, string | null>;
    loadingStacks: boolean;
    loadingGroups: boolean;
    loadingByScope: Record<NotesScopeId, boolean>;
    fetchStacks: () => Promise<void>;
    fetchGroups: () => Promise<void>;
    fetchNotesForGroupInternal: (
        groupId: string,
        scopeId: NotesScopeId,
        options?: { activateScope?: boolean },
    ) => Promise<void>;
    createStack: (title: string) => Promise<void>;
    deleteStack: (stackId: string) => Promise<void>;
    createGroup: (title: string, stackId: string) => Promise<void>;
    deleteGroup: (groupId: string) => Promise<void>;
    renameStack: (stackId: string, newTitle: string) => Promise<void>;
    renameGroup: (groupId: string, newTitle: string) => Promise<void>;
    createNote: (
        groupId: string,
        title: string,
        content: string,
        tags?: string,
        linkedEchoId?: string | null,
        scopeId?: NotesScopeId,
    ) => Promise<string | null>;
    updateNote: (
        noteId: string,
        groupId: string,
        title: string,
        content: string,
        tags?: string,
        scopeId?: NotesScopeId,
    ) => Promise<void>;
    deleteNote: (
        noteId: string,
        groupId: string,
        scopeId?: NotesScopeId,
    ) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

const DEFAULT_SCOPE_ID = "default";

export function NotesDataProvider({ children }: { children: React.ReactNode }) {
    const { subscribe } = useRefreshBus();

    const [stacks, setStacks] = useState<NoteStack[]>([]);
    const [groups, setGroups] = useState<NoteGroup[]>([]);
    const [notesByGroup, setNotesByGroup] = useState<
        Record<string, NoteItem[]>
    >({});
    const [activeGroupByScope, setActiveGroupByScope] = useState<
        Record<NotesScopeId, string | null>
    >({});
    const [loadingStacks, setLoadingStacks] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingByScope, setLoadingByScope] = useState<
        Record<NotesScopeId, boolean>
    >({});

    const fetchStacksReq = useRef(0);
    const fetchGroupsReq = useRef(0);
    const fetchNotesReqByGroup = useRef<Record<string, number>>({});
    const fetchStacksPromiseRef = useRef<Promise<void> | null>(null);
    const fetchGroupsPromiseRef = useRef<Promise<void> | null>(null);
    const fetchNotesPromiseByGroup = useRef<Record<string, Promise<void>>>({});

    const fetchStacks = useCallback(async () => {
        if (fetchStacksPromiseRef.current) {
            return fetchStacksPromiseRef.current;
        }

        const currentReq = ++fetchStacksReq.current;
        const request = (async () => {
            setLoadingStacks(true);
            try {
                const res = await axios.get(`${API_BASE}/notes/stacks`);
                if (
                    currentReq === fetchStacksReq.current &&
                    res.data.status === "success"
                ) {
                    setStacks(res.data.data || []);
                }
            } catch (error) {
                console.error("Failed to fetch stacks", error);
            } finally {
                if (currentReq === fetchStacksReq.current) {
                    setLoadingStacks(false);
                }
            }
        })();

        fetchStacksPromiseRef.current = request;
        try {
            await request;
        } finally {
            if (fetchStacksPromiseRef.current === request) {
                fetchStacksPromiseRef.current = null;
            }
        }
    }, []);

    const fetchGroups = useCallback(async () => {
        if (fetchGroupsPromiseRef.current) {
            return fetchGroupsPromiseRef.current;
        }

        const currentReq = ++fetchGroupsReq.current;
        const request = (async () => {
            setLoadingGroups(true);
            try {
                const res = await axios.get(`${API_BASE}/notes/groups`);
                if (
                    currentReq === fetchGroupsReq.current &&
                    res.data.status === "success"
                ) {
                    setGroups(res.data.data || []);
                }
            } catch (error) {
                console.error("Failed to fetch groups", error);
            } finally {
                if (currentReq === fetchGroupsReq.current) {
                    setLoadingGroups(false);
                }
            }
        })();

        fetchGroupsPromiseRef.current = request;
        try {
            await request;
        } finally {
            if (fetchGroupsPromiseRef.current === request) {
                fetchGroupsPromiseRef.current = null;
            }
        }
    }, []);

    const fetchNotesForGroupInternal = useCallback(
        async (
            groupId: string,
            scopeId: NotesScopeId = DEFAULT_SCOPE_ID,
            options: { activateScope?: boolean } = {},
        ) => {
            if (!groupId) return;

            if (options.activateScope !== false) {
                setActiveGroupByScope((prev) => {
                    if (prev[scopeId] === groupId) return prev;
                    return { ...prev, [scopeId]: groupId };
                });
            }

            if (fetchNotesPromiseByGroup.current[groupId]) {
                return fetchNotesPromiseByGroup.current[groupId];
            }

            const currentReq = (fetchNotesReqByGroup.current[groupId] || 0) + 1;
            fetchNotesReqByGroup.current[groupId] = currentReq;

            const request = (async () => {
                setLoadingByScope((prev) => ({ ...prev, [scopeId]: true }));
                try {
                    const res = await axios.get(
                        `${API_BASE}/notes/item/${groupId}`,
                    );
                    if (
                        fetchNotesReqByGroup.current[groupId] === currentReq &&
                        res.data.status === "success"
                    ) {
                        setNotesByGroup((prev) => ({
                            ...prev,
                            [groupId]: res.data.data || [],
                        }));
                    }
                } catch (error) {
                    console.error("Failed to fetch notes", error);
                } finally {
                    if (fetchNotesReqByGroup.current[groupId] === currentReq) {
                        setLoadingByScope((prev) => ({
                            ...prev,
                            [scopeId]: false,
                        }));
                    }
                }
            })();

            fetchNotesPromiseByGroup.current[groupId] = request;
            try {
                await request;
            } finally {
                if (fetchNotesPromiseByGroup.current[groupId] === request) {
                    delete fetchNotesPromiseByGroup.current[groupId];
                }
            }
        },
        [],
    );

    const clearGroupFromScopes = useCallback((groupId: string) => {
        setActiveGroupByScope((prev) => {
            let changed = false;
            const next = { ...prev };
            Object.entries(prev).forEach(([scopeId, activeGroupId]) => {
                if (String(activeGroupId || "") === String(groupId)) {
                    next[scopeId] = null;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, []);

    const createStack = useCallback(
        async (title: string) => {
            try {
                const res = await axios.post(
                    `${API_BASE}/notes/stacks/create`,
                    { title },
                );
                if (res.data.status === "success") {
                    await fetchStacks();
                }
            } catch (error) {
                console.error("Failed to create stack", error);
            }
        },
        [fetchStacks],
    );

    const deleteStack = useCallback(
        async (stackId: string) => {
            try {
                const res = await axios.delete(
                    `${API_BASE}/notes/stacks/${stackId}`,
                );
                if (res.data.status === "success") {
                    setStacks((prev) =>
                        prev.filter((stack) => stack.stack_id !== stackId),
                    );
                    const removedGroupIds = groups
                        .filter((group) => group.stack_id === stackId)
                        .map((group) => group.group_id);
                    setGroups((prev) =>
                        prev.filter((group) => group.stack_id !== stackId),
                    );
                    if (removedGroupIds.length > 0) {
                        setNotesByGroup((prev) => {
                            const next = { ...prev };
                            removedGroupIds.forEach((groupId) => {
                                delete next[groupId];
                            });
                            return next;
                        });
                        removedGroupIds.forEach(clearGroupFromScopes);
                    }
                    await Promise.allSettled([fetchStacks(), fetchGroups()]);
                }
            } catch (error) {
                console.error("Failed to delete stack", error);
                setStacks((prev) =>
                    prev.filter((stack) => stack.stack_id !== stackId),
                );
            }
        },
        [clearGroupFromScopes, fetchGroups, fetchStacks, groups],
    );

    const createGroup = useCallback(
        async (title: string, stackId: string) => {
            try {
                const res = await axios.post(
                    `${API_BASE}/notes/groups/create`,
                    {
                        title,
                        stack_id: stackId,
                    },
                );
                if (res.data.status === "success") {
                    await fetchGroups();
                }
            } catch (error) {
                console.error("Failed to create group", error);
            }
        },
        [fetchGroups],
    );

    const deleteGroup = useCallback(
        async (groupId: string) => {
            try {
                const res = await axios.delete(
                    `${API_BASE}/notes/groups/${groupId}`,
                );
                if (res.data.status === "success") {
                    setGroups((prev) =>
                        prev.filter((group) => group.group_id !== groupId),
                    );
                    setNotesByGroup((prev) => {
                        if (!prev[groupId]) return prev;
                        const next = { ...prev };
                        delete next[groupId];
                        return next;
                    });
                    clearGroupFromScopes(groupId);
                    await fetchGroups();
                }
            } catch (error) {
                console.error("Failed to delete group", error);
            }
        },
        [clearGroupFromScopes, fetchGroups],
    );

    const renameStack = useCallback(
        async (stackId: string, newTitle: string) => {
            setStacks((prev) =>
                prev.map((stack) =>
                    stack.stack_id === stackId
                        ? { ...stack, title: newTitle }
                        : stack,
                ),
            );
            try {
                const res = await axios.put(`${API_BASE}/notes/stacks/update`, {
                    stack_id: stackId,
                    title: newTitle,
                });
                if (res.data.status !== "success") {
                    await fetchStacks();
                }
            } catch (error) {
                console.error("Failed to rename stack", error);
                await fetchStacks();
            }
        },
        [fetchStacks],
    );

    const renameGroup = useCallback(
        async (groupId: string, newTitle: string) => {
            setGroups((prev) =>
                prev.map((group) =>
                    group.group_id === groupId
                        ? { ...group, title: newTitle }
                        : group,
                ),
            );
            try {
                const res = await axios.put(`${API_BASE}/notes/groups/update`, {
                    group_id: groupId,
                    title: newTitle,
                });
                if (res.data.status !== "success") {
                    await fetchGroups();
                }
            } catch (error) {
                console.error("Failed to rename group", error);
                await fetchGroups();
            }
        },
        [fetchGroups],
    );

    const createNote = useCallback(
        async (
            groupId: string,
            title: string,
            content: string,
            tags: string = "",
            linkedEchoId: string | null = null,
            scopeId: NotesScopeId = DEFAULT_SCOPE_ID,
        ) => {
            try {
                const res = await axios.post(`${API_BASE}/notes/item/create`, {
                    group_id: groupId,
                    title,
                    content,
                    tags,
                    linked_echo_id: linkedEchoId,
                });
                if (res.data.status === "success") {
                    if (groupId) {
                        await fetchNotesForGroupInternal(groupId, scopeId);
                    }
                    return res.data.note_id || null;
                }
            } catch (error) {
                console.error("Failed to create note", error);
            }
            return null;
        },
        [fetchNotesForGroupInternal],
    );

    const updateNote = useCallback(
        async (
            noteId: string,
            groupId: string,
            title: string,
            content: string,
            tags: string = "",
            scopeId: NotesScopeId = DEFAULT_SCOPE_ID,
        ) => {
            try {
                const res = await axios.put(`${API_BASE}/notes/item/update`, {
                    note_id: noteId,
                    title,
                    content,
                    tags,
                    group_id: groupId,
                });
                if (res.data.status === "success" && groupId) {
                    await fetchNotesForGroupInternal(groupId, scopeId);
                }
            } catch (error) {
                console.error("Failed to update note", error);
            }
        },
        [fetchNotesForGroupInternal],
    );

    const deleteNote = useCallback(
        async (
            noteId: string,
            groupId: string,
            scopeId: NotesScopeId = DEFAULT_SCOPE_ID,
        ) => {
            try {
                const res = await axios.delete(
                    `${API_BASE}/notes/item/${noteId}`,
                );
                if (res.data.status === "success" && groupId) {
                    await fetchNotesForGroupInternal(groupId, scopeId);
                }
            } catch (error) {
                console.error("Failed to delete note", error);
            }
        },
        [fetchNotesForGroupInternal],
    );

    useEffect(() => {
        return subscribe((scopes) => {
            if (scopes.includes("notes.stacks")) {
                fetchStacks();
            }
            if (scopes.includes("notes.groups")) {
                fetchGroups();
            }

            scopes
                .filter((scope) => scope.startsWith("notes.group:"))
                .forEach((scope) => {
                    const groupId = scope.slice("notes.group:".length);
                    if (groupId) {
                        fetchNotesForGroupInternal(groupId, DEFAULT_SCOPE_ID, {
                            activateScope: false,
                        });
                    }
                });
        });
    }, [fetchGroups, fetchNotesForGroupInternal, fetchStacks, subscribe]);

    const contextValue = useMemo<NotesContextValue>(
        () => ({
            stacks,
            groups,
            notesByGroup,
            activeGroupByScope,
            loadingStacks,
            loadingGroups,
            loadingByScope,
            fetchStacks,
            fetchGroups,
            fetchNotesForGroupInternal,
            createStack,
            deleteStack,
            createGroup,
            deleteGroup,
            renameStack,
            renameGroup,
            createNote,
            updateNote,
            deleteNote,
        }),
        [
            activeGroupByScope,
            createGroup,
            createNote,
            createStack,
            deleteGroup,
            deleteNote,
            deleteStack,
            fetchGroups,
            fetchNotesForGroupInternal,
            fetchStacks,
            groups,
            loadingByScope,
            loadingGroups,
            loadingStacks,
            notesByGroup,
            renameGroup,
            renameStack,
            stacks,
            updateNote,
        ],
    );

    return (
        <NotesContext.Provider value={contextValue}>
            {children}
        </NotesContext.Provider>
    );
}

export default function useNotes(scopeId: NotesScopeId = DEFAULT_SCOPE_ID) {
    const context = useContext(NotesContext);

    if (!context) {
        throw new Error("useNotes must be used within NotesDataProvider");
    }

    const activeGroupId = context.activeGroupByScope[scopeId] || null;
    const currentNotes = activeGroupId
        ? context.notesByGroup[activeGroupId] || []
        : [];

    const fetchNotesForGroup = useCallback(
        async (groupId: string) =>
            context.fetchNotesForGroupInternal(groupId, scopeId),
        [context, scopeId],
    );

    const loading =
        context.loadingStacks ||
        context.loadingGroups ||
        Boolean(context.loadingByScope[scopeId]);

    return {
        stacks: context.stacks,
        groups: context.groups,
        notesByGroup: context.notesByGroup,
        currentNotes,
        loading,
        fetchStacks: context.fetchStacks,
        createStack: context.createStack,
        deleteStack: context.deleteStack,
        fetchGroups: context.fetchGroups,
        createGroup: context.createGroup,
        deleteGroup: context.deleteGroup,
        fetchNotesForGroup,
        createNote: (
            groupId: string,
            title: string,
            content: string,
            tags: string = "",
            linkedEchoId: string | null = null,
        ) =>
            context.createNote(
                groupId,
                title,
                content,
                tags,
                linkedEchoId,
                scopeId,
            ),
        updateNote: (
            noteId: string,
            groupId: string,
            title: string,
            content: string,
            tags: string = "",
        ) => context.updateNote(noteId, groupId, title, content, tags, scopeId),
        deleteNote: (noteId: string, groupId: string) =>
            context.deleteNote(noteId, groupId, scopeId),
        renameStack: context.renameStack,
        renameGroup: context.renameGroup,
    };
}
