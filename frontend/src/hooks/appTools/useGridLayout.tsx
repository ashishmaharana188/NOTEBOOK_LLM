import { useState, useRef, useCallback, useEffect } from "react";

export default function useGridLayout() {
  // 1. Tracks real-time drags before saving
  const [draftGridCoordinates, setDraftGridCoordinates] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // 2. Tracks real-time overlaps to solve the "Z-Index" stack problem
  const [gridZIndexes, setGridZIndexes] = useState<Record<string, number>>({});
  const maxGridZRef = useRef(10000);

  const [animatingGridIds, setAnimatingGridIds] = useState<string[]>([]);
  const [gridAnimationTargets, setGridAnimationTargets] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current)
        clearTimeout(animationTimeoutRef.current);
    };
  }, []);

  // Bump a card to the front visually while dragging
  const bringToFrontGrid = useCallback((itemId: string) => {
    maxGridZRef.current += 1;
    setGridZIndexes((prev) => ({
      ...prev,
      [itemId]: maxGridZRef.current,
    }));
  }, []);

  // Record a drop location
  const updateGridPosition = useCallback(
    (itemId: string, x: number, y: number) => {
      setDraftGridCoordinates((prev) => {
        const current = prev[itemId];
        if (current?.x === x && current?.y === y) {
          return prev;
        }
        return {
          ...prev,
          [itemId]: { x, y },
        };
      });
    },
    [],
  );

  // ... (keep bringToFrontGrid and updateGridPosition the same) ...

  const saveGrid = async ({
    selectedIds,
    spatialMetadata,
    dataset,
    getId,
    getType,
    getDefaultPos,
    onSuccess,
  }: any) => {
    const datasetIndexById = new Map<string, number>();
    dataset.forEach((item: any, index: number) => {
      const itemId = getId(item);
      if (itemId) datasetIndexById.set(itemId, index);
    });

    let maxZ = 0;
    Object.values(spatialMetadata).forEach((meta: any) => {
      if (meta.z_index > maxZ) maxZ = meta.z_index;
    });

    const visuallySortedIds = [...selectedIds].sort((idA, idB) => {
      const zA = gridZIndexes[idA] || spatialMetadata[idA]?.z_index || 0;
      const zB = gridZIndexes[idB] || spatialMetadata[idB]?.z_index || 0;
      return zA - zB;
    });

    const newDrafts = { ...draftGridCoordinates };
    const itemsToSave = visuallySortedIds.map((id, index) => {
      const draft = draftGridCoordinates[id];
      const saved = spatialMetadata[id];
      const itemIndex = datasetIndexById.get(id) ?? -1;
      const defaultPos = getDefaultPos(itemIndex >= 0 ? itemIndex : index);

      const finalX = draft?.x ?? saved?.x_coord ?? defaultPos.x;
      const finalY = draft?.y ?? saved?.y_coord ?? defaultPos.y;

      newDrafts[id] = { x: finalX, y: finalY };
      const targetItem = dataset[itemIndex];

      return {
        item_id: id,
        item_type: getType(targetItem),
        x_coord: finalX,
        y_coord: finalY,
        orientation: saved?.orientation || "portrait",
        z_index: maxZ + index + 1,
      };
    });

    setGridAnimationTargets(newDrafts);
    setAnimatingGridIds(visuallySortedIds);

    // Cancel any overlapping saves to prevent state collisions
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);

    // THE FIX: Wait exactly 600ms for the Vanish & Pop to finish physically before committing to React
    animationTimeoutRef.current = setTimeout(() => {
      setDraftGridCoordinates(newDrafts);
      setAnimatingGridIds([]);
      setGridAnimationTargets({});
    }, 600);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/brain/canvas/metadata/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemsToSave }),
        },
      );
      if (response.ok && onSuccess) onSuccess();
    } catch (e) {
      console.error("Failed to save layout", e);
    }
  };

  const saveGridSet = async (
    parentSlotId: string, // <--- This is now strictly the current depth ID (e.g., the folder ID)
    activeLayout: Record<string, any>,
    selectedIds: string[],
    onSuccess?: () => void,
  ) => {
    const payload = selectedIds
      .filter((id) => activeLayout[id])
      // THE FIX: Accept loopIndex to act as our safe fallback!
      .map((id, loopIndex) => {
        const layout = activeLayout[id];
        // THE FIX: Provide strict numeric fallbacks so undefined never reaches the API!
        const safeIndex = layout.index !== undefined ? layout.index : loopIndex;

        return {
          item_id: `SLOT_${parentSlotId}_${id}`,
          item_type: "ORBIT_SLOT",
          parent_id: parentSlotId,
          x: layout.x ?? 0,
          y: layout.y ?? 0,
          z_index: layout.z ?? safeIndex,
        };
      });

    if (payload.length > 0) {
      try {
        const res = await fetch(
          "http://127.0.0.1:8000/brain/cluster/orbit_metadata",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: payload }),
          },
        );
        if (res.ok && onSuccess) {
          onSuccess();
        }
      } catch (e) {
        console.error("Failed to save scattered grid", e);
      }
    }
  };

  return {
    draftGridCoordinates,
    gridZIndexes,
    bringToFrontGrid,
    updateGridPosition,
    saveGrid,
    saveGridSet,
    animatingGridIds,
    gridAnimationTargets, // <-- Export the new state
  };
}

export const getGridAnimationProps = (
  isBeingGridded: boolean,
  currentX: number,
  currentY: number,
  targetX?: number,
  targetY?: number,
  isFolder: boolean = false,
) => {
  if (isBeingGridded && targetX !== undefined && targetY !== undefined) {
    return {
      animate: {
        x: [currentX, currentX, targetX, targetX, targetX],
        y: [currentY, currentY, targetY, targetY, targetY],
        scale: [1, 0, 0, 1.15, 1],
        opacity: [1, 0, 0, 1, 1],
      },
      transition: {
        // Wait until 20% (when scale is 0), then instantly teleport coordinates!
        x: { type: "tween", duration: 0.6, times: [0, 0.2, 0.21, 0.8, 1] },
        y: { type: "tween", duration: 0.6, times: [0, 0.2, 0.21, 0.8, 1] },
        scale: {
          duration: 0.6,
          times: [0, 0.2, 0.4, 0.8, 1],
          ease: "easeInOut",
        },
        opacity: {
          duration: 0.6,
          times: [0, 0.15, 0.45, 0.8, 1],
          ease: "easeInOut",
        },
      },
    };
  }

  // Normal settle behavior
  return {
    animate: { x: currentX, y: currentY, scale: 1, opacity: 1 },
    transition: { type: "spring", stiffness: 220, damping: isFolder ? 25 : 30 },
  };
};
