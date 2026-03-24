import { useState, useCallback } from "react";

export const getRealId = (node: any) =>
  node.note_id || node.echo_id || node.chunk_id;

export default function useQuickThoughts(orbitingItems: any[]) {
  const [activeThoughts, setActiveThoughts] = useState<Record<string, any[]>>(
    {},
  );

  const handleSaveThoughts = useCallback(
    async (parentId: string, parentType: string, newThoughts: any[]) => {
      setActiveThoughts((prev) => ({ ...prev, [parentId]: newThoughts }));
      try {
        await fetch("http://127.0.0.1:8000/brain/quick_thoughts/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: parentId,
            thoughts: JSON.stringify(newThoughts),
            item_type: parentType,
          }),
        });
      } catch (error) {
        console.error("Error saving quick thoughts:", error);
      }
    },
    [],
  );

  const handleModifyThought = useCallback(
    (
      action: string,
      thoughtId: number,
      parentId: string,
      parentType: string,
      newText = "",
    ) => {
      const parentNode = orbitingItems.find(
        (i: any) => getRealId(i) === parentId,
      );
      let parsed = [];
      try {
        parsed = parentNode?.quick_thoughts
          ? JSON.parse(parentNode.quick_thoughts)
          : [];
      } catch (e) {}

      const existing =
        activeThoughts[parentId] !== undefined
          ? activeThoughts[parentId]
          : parsed;

      let updated;
      if (action === "update") {
        updated = existing.map((t: any) =>
          t.id === thoughtId ? { ...t, text: newText } : t,
        );
      } else {
        updated = existing.filter((t: any) => t.id !== thoughtId);
      }
      handleSaveThoughts(parentId, parentType, updated);
    },
    [orbitingItems, activeThoughts, handleSaveThoughts],
  );

  const handleAddQuickThought = useCallback(
    (currentActiveNode: any) => {
      if (!currentActiveNode) return;

      const parentId = getRealId(currentActiveNode);
      const parentType =
        currentActiveNode.type ||
        (currentActiveNode.relation?.includes("Note") ? "note" : "echo");

      let parsed = [];
      try {
        parsed = currentActiveNode.quick_thoughts
          ? JSON.parse(currentActiveNode.quick_thoughts)
          : [];
      } catch (e) {}

      const existing =
        activeThoughts[parentId] !== undefined
          ? activeThoughts[parentId]
          : parsed;

      const styles = [
        "bg-pink-100 border-pink-200 text-pink-950",
        "bg-yellow-100 border-yellow-200 text-yellow-950",
        "bg-sky-100 border-sky-200 text-sky-950",
        "bg-emerald-100 border-emerald-200 text-emerald-950",
      ];

      handleSaveThoughts(parentId, parentType, [
        ...existing,
        {
          id: Date.now(),
          text: "",
          styleClass: styles[Math.floor(Math.random() * styles.length)],
        },
      ]);
    },
    [activeThoughts, handleSaveThoughts],
  );

  return { activeThoughts, handleModifyThought, handleAddQuickThought };
}
