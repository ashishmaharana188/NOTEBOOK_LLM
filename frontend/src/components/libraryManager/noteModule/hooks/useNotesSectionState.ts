import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import useNotes from "../../../../hooks/noteManager/useNotes";
import { confirmAction } from "../../../system/AppNotifications";

export default function useNotesSectionState() {
  const {
    stacks,
    groups,
    notesByGroup,
    currentNotes,
    fetchStacks,
    fetchGroups,
    createStack,
    deleteStack,
    createGroup,
    deleteGroup,
    fetchNotesForGroup,
    createNote,
    updateNote,
    deleteNote,
    renameStack,
    renameGroup,
  } = useNotes("notesSection");

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isCreatingStack, setIsCreatingStack] = useState(false);
  const [draftStackTitle, setDraftStackTitle] = useState("");
  const [canvasScale, setCanvasScale] = useState(1);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [topZIndex, setTopZIndex] = useState(10);
  const [zIndexes, setZIndexes] = useState<Record<string, number>>({});
  const [zoomTarget, setZoomTarget] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [formState, setFormState] = useState<{
    isOpen: boolean;
    groupId: string | null;
    note: any | null; // using any to match NoteItem flexibility
  }>({ isOpen: false, groupId: null, note: null });

  // --- INITIAL DATA LOAD ---
  useEffect(() => {
    fetchStacks();
    fetchGroups();
  }, [fetchStacks, fetchGroups]);

  // --- INITIALIZE STACK POSITIONS ---
  useEffect(() => {
    if (stacks.length > 0) {
      setPositions((prev) => {
        const newPos = { ...prev };
        let offsetX = 100;
        stacks.forEach((s) => {
          if (!newPos[s.stack_id]) {
            newPos[s.stack_id] = { x: offsetX, y: 150 };
            offsetX += 700;
          }
        });
        return newPos;
      });
    }
  }, [stacks]);

  // --- INTERCEPT NAVIGATION FROM MIND MAP & SPATIAL CANVAS ---
  useEffect(() => {
    const checkPendingAction = () => {
      const pendingStr = sessionStorage.getItem("pendingNoteAction");
      if (!pendingStr) return;

      try {
        const action = JSON.parse(pendingStr);

        // THE FIX: Removed `if (stacks.length === 0) return;` so it NEVER silently aborts!

        sessionStorage.removeItem("pendingNoteAction");

        setTimeout(() => {
          let targetStackId = null;
          let targetHighlightId = null;

          if (action.type === "VIEW_FOLDER") {
            if (groups.length === 0) return;
            setActiveGroupId(action.payload.groupId);
            fetchNotesForGroup(action.payload.groupId);
            const group = groups.find(
              (g) => String(g.group_id) === String(action.payload.groupId),
            );
            if (group) {
              targetStackId = group.stack_id;
              targetHighlightId = action.payload.groupId;
            }
          } else if (action.type === "EDIT_NOTE") {
            setActiveGroupId(action.payload.groupId);
            fetchNotesForGroup(action.payload.groupId);

            // Unfiled notes won't have a matching group, which is fine!
            const group = groups.find(
              (g) => String(g.group_id) === String(action.payload.groupId),
            );
            if (group) {
              targetStackId = group.stack_id;
              targetHighlightId = action.payload.groupId;
            }

            // THE FIX: Add a robust fallback so the form ALWAYS opens, even if the backend 404s on a brand new manual card!
            axios
              .get(
                `http://127.0.0.1:8000/notes/item/single/${action.payload.noteId}`,
              )
              .then((res) => {
                if (res.data.status === "success" && res.data.data) {
                  setFormState({
                    isOpen: true,
                    groupId: action.payload.groupId,
                    note: res.data.data,
                  });
                } else {
                  // Fallback: Force open with the text captured from the Canvas
                  setFormState({
                    isOpen: true,
                    groupId: action.payload.groupId,
                    note: {
                      note_id: action.payload.noteId,
                      title: "Untitled Note",
                      content: action.payload.text || "",
                    },
                  });
                }
              })
              .catch(() => {
                // Fallback: If Network Error or 404 (Card exists on canvas but not in DB yet)
                setFormState({
                  isOpen: true,
                  groupId: action.payload.groupId,
                  note: {
                    note_id: action.payload.noteId,
                    title: "Untitled Note",
                    content: action.payload.text || "",
                  },
                });
              });
          } else if (action.type === "VIEW_STACK") {
            targetStackId = action.payload.stackId;
            targetHighlightId = action.payload.stackId;
          }

          if (targetStackId) {
            setZoomTarget(targetStackId);
            setHighlightId(targetHighlightId);
            setTimeout(() => setHighlightId(null), 1200);
          }
        }, 400);
      } catch (e) {
        console.error("Failed to parse navigation action", e);
        sessionStorage.removeItem("pendingNoteAction");
      }
    };

    // Run on mount
    checkPendingAction();

    // THE FIX: Listen for the custom event dispatched by Spatial Canvas
    window.addEventListener("noteActionDispatched", checkPendingAction);
    return () =>
      window.removeEventListener("noteActionDispatched", checkPendingAction);
  }, [stacks, groups, fetchNotesForGroup]);

  // --- STABLE CALLBACKS FOR MEMOIZED COMPONENTS ---
  const updatePosition = useCallback(
    (id: string, newPos: { x: number; y: number }) => {
      setPositions((prev) => ({ ...prev, [id]: newPos }));
    },
    [],
  );

  const bringToFront = useCallback((id: string) => {
    setTopZIndex((prev) => {
      const nextZ = prev + 1;
      setZIndexes((zMap) => ({ ...zMap, [id]: nextZ }));
      return nextZ;
    });
  }, []);

  // THE FIX: Stable callbacks to prevent child components from re-rendering needlessly
  const handleDeleteStack = useCallback(
    async (id: string) => {
      const confirmed = await confirmAction({
        title: "Delete Stack",
        message: "Delete stack?",
        tone: "error",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
      });
      if (confirmed) await deleteStack(id);
    },
    [deleteStack],
  );

  const handleOpenGroup = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      fetchNotesForGroup(groupId);
    },
    [fetchNotesForGroup],
  );

  const handleInitiateCreateNote = useCallback((groupId: string) => {
    setFormState({ isOpen: true, groupId, note: null });
  }, []);

  const handleOpenNote = useCallback((note: any) => {
    setFormState({ isOpen: true, groupId: note.group_id, note });
  }, []);

  const handleDeleteGroup = useCallback(
    async (id: string) => {
      const confirmed = await confirmAction({
        title: "Delete Folder",
        message: "Delete folder?",
        tone: "error",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
      });
      if (confirmed) await deleteGroup(id);
    },
    [deleteGroup],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      const confirmed = await confirmAction({
        title: "Delete Note",
        message: "Delete note?",
        tone: "error",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
      });
      if (confirmed && activeGroupId) {
        await deleteNote(id, activeGroupId);
      }
    },
    [deleteNote, activeGroupId],
  );

  return {
    // Note Management Operations
    stacks,
    groups,
    notesByGroup,
    currentNotes,
    createStack,
    deleteStack,
    createGroup,
    deleteGroup,
    fetchNotesForGroup,
    createNote,
    updateNote,
    deleteNote,
    renameStack,
    renameGroup,
    updatePosition,
    bringToFront,

    // Stable Event Handlers
    handleDeleteStack,
    handleOpenGroup,
    handleInitiateCreateNote,
    handleOpenNote,
    handleDeleteGroup,
    handleDeleteNote,

    // UI State
    activeGroupId,
    setActiveGroupId,
    isCreatingStack,
    setIsCreatingStack,
    draftStackTitle,
    setDraftStackTitle,
    canvasScale,
    setCanvasScale,
    positions,
    zIndexes,
    zoomTarget,
    setZoomTarget,
    highlightId,
    formState,
    setFormState,
  };
}
