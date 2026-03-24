import { useMemo } from "react";
import {
  getCardRole,
  QUICK_THOUGHT_PATTERN,
  PATTERN_A,
  PATTERN_B,
} from "../utils/spatialConstants";

export default function useStackLayoutMap({
  isExpanded,
  isNotesMode,
  noteStack,
  cluster,
  allItemsToRender,
  canvasMode,
  manualSlots,
  spatialMetadata,
  currentExpandedId,
  currentDirection,
  primarySizeOffset,
  itemId,
  localZOrder = [],
}: any) {
  return useMemo(() => {
    if (!isExpanded) return {};

    const layoutMap: any = {};

    let masterLayout: any[] = [];
    const rawLayout = isNotesMode
      ? noteStack?.orbit_layout
      : cluster?.orbit_layout;

    if (Array.isArray(rawLayout)) {
      masterLayout = rawLayout;
    } else if (typeof rawLayout === "string") {
      try {
        const parsed = JSON.parse(rawLayout);
        masterLayout = Array.isArray(parsed) ? parsed : Object.values(parsed);
      } catch (e) {
        masterLayout = [];
      }
    } else if (typeof rawLayout === "object" && rawLayout !== null) {
      masterLayout = Object.values(rawLayout);
    }

    allItemsToRender.forEach((chunk: any, index: number) => {
      const role = getCardRole(index, chunk, canvasMode);

      let customW = null,
        customH = null;
      const tagsStr = chunk.tags || "";
      if (tagsStr.includes("size:A3")) {
        customW = 600;
        customH = 800;
      } else if (tagsStr.includes("size:A4")) {
        customW = 450;
        customH = 600;
      } else if (tagsStr.includes("size:A5")) {
        customW = 300;
        customH = 400;
      } else if (tagsStr.includes("size:A6")) {
        customW = 200;
        customH = 300;
      } else if (tagsStr.includes("size:A7")) {
        customW = 150;
        customH = 200;
      }

      let baseW = 0,
        baseH = 0;
      if (role === "QUICK_THOUGHT") {
        baseW = 140;
        baseH = 180;
      } else if (role === "A5_NOTE" || role === "A5_ECHO") {
        baseW = customW || 200;
        baseH = customH || 280;
      } else {
        baseW = customW || 300;
        baseH = customH || 400;
      }

      const cardId =
        chunk.echo_id || chunk.note_id || chunk.chunk_id || `idx-${index}`;
      const localDragSlot = manualSlots[cardId];

      const orbitSlot = masterLayout.find(
        (l: any) => String(l.id || l.item_id) === String(cardId),
      );

      const savedDbSlotRaw = spatialMetadata
        ? spatialMetadata[`SLOT_${currentExpandedId}_${cardId}`]
        : null;

      const savedDbSlot = savedDbSlotRaw;

      let cx, cy;
      if (localDragSlot) {
        cx = localDragSlot.x + baseW / 2;
        cy = localDragSlot.y + baseH / 2;
      } else if (orbitSlot && orbitSlot.x !== undefined) {
        cx = orbitSlot.x + baseW / 2;
        cy = orbitSlot.y + baseH / 2;
      } else if (savedDbSlot) {
        cx = (savedDbSlot.x ?? savedDbSlot.x_coord) + baseW / 2;
        cy = (savedDbSlot.y ?? savedDbSlot.y_coord) + baseH / 2;
      } else {
        let targetPos;
        if (role === "QUICK_THOUGHT") {
          targetPos =
            QUICK_THOUGHT_PATTERN[index % QUICK_THOUGHT_PATTERN.length];
        } else {
          const basePattern =
            currentDirection === "LEFT" ? PATTERN_A : PATTERN_B;
          const baseLen = basePattern.length || 1;
          const ring = Math.floor(index / baseLen);
          const bp = basePattern[index % baseLen] || { x: 0, y: 0 };
          targetPos = {
            x: bp.x * (1 + ring * 0.4),
            y: bp.y * (1 + ring * 0.4),
          };
        }
        const safePos = targetPos || { x: 0, y: 0 };
        const dirX = Math.sign(safePos.x);
        const dirY = Math.sign(safePos.y);
        cx = safePos.x + dirX * (primarySizeOffset?.w || 0) * 0.3;
        cy = safePos.y + dirY * (primarySizeOffset?.h || 0) * 1.0;
      }

      const interactionIndex = localZOrder.indexOf(cardId);
      const liveZIndex =
        interactionIndex !== -1
          ? 100 + interactionIndex // If you just dragged it, bring it to the absolute front!
          : savedDbSlot?.z_index !== undefined
            ? savedDbSlot.z_index // If it has a saved order in the DB, respect it!
            : allItemsToRender.length - index; // Default fallback

      layoutMap[cardId] = {
        x: cx - baseW / 2,
        y: cy - baseH / 2,
        z: liveZIndex,
        index: index,
        w: baseW,
        h: baseH,
      };
    });

    return layoutMap;
  }, [
    allItemsToRender,
    isExpanded,
    currentDirection,
    primarySizeOffset,
    canvasMode,
    manualSlots,
    spatialMetadata,
    currentExpandedId,
    cluster?.orbit_layout,
    noteStack?.orbit_layout,
    isNotesMode,
    itemId,
  ]);
}
