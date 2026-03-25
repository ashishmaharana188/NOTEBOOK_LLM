import { useState, useRef, useEffect, useCallback } from "react";

export default function useCanvasCamera(
  canvasMode: "ECHO" | "NOTES",
  loopDataset: any[],
  spatialMetadata: Record<string, any>,
) {
  const transformComponentRef = useRef<any>(null);
  const hasInitializedPan = useRef<Record<string, boolean>>({});

  // --- THE FIX: Animation/Debounce Tracker ---
  const cullingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [canvasScale, setCanvasScale] = useState(0.7);
  const [cameraPositionX, setCameraPositionX] = useState(300);
  const [cameraPositionY, setCameraPositionY] = useState(150);
  const [cullingRect, setCullingRect] = useState({
    left: -5000,
    right: 5000,
    top: -5000,
    bottom: 5000,
  });

  const syncCameraState = useCallback((ref: any) => {
    if (!ref?.state) return;

    const scale = ref.state.scale || 1;
    const x = ref.state.positionX ?? ref.state.x ?? 0;
    const y = ref.state.positionY ?? ref.state.y ?? 0;

    setCanvasScale(scale);
    setCameraPositionX(x);
    setCameraPositionY(y);
  }, []);

  const updateCulling = useCallback((ref: any) => {
    if (!ref?.state) return;

    syncCameraState(ref);

    // Clear previous timeout to debounce the aggressive state updates
    if (cullingTimeoutRef.current) {
      clearTimeout(cullingTimeoutRef.current);
    }

    // Wait 150ms after the user STOPS panning/zooming before recalculating the bounds
    cullingTimeoutRef.current = setTimeout(() => {
      const scale = ref.state.scale || 1;
      const x = ref.state.positionX ?? ref.state.x ?? 0;
      const y = ref.state.positionY ?? ref.state.y ?? 0;
      const viewportSpan = Math.max(window.innerWidth, window.innerHeight);
      const buffer = Math.max(900, Math.min(1400, viewportSpan * 0.6));

      setCullingRect({
        left: -x / scale - buffer,
        right: (-x + window.innerWidth) / scale + buffer,
        top: -y / scale - buffer,
        bottom: (-y + window.innerHeight) / scale + buffer,
      });
    }, 150);
  }, []);

  // Prevent memory leaks if the canvas unmounts while panning
  useEffect(() => {
    return () => {
      if (cullingTimeoutRef.current) clearTimeout(cullingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (loopDataset.length > 0 && transformComponentRef.current) {
      if (!hasInitializedPan.current[canvasMode]) {
        hasInitializedPan.current[canvasMode] = true;

        let maxX = -Infinity;
        let targetY = 150;

        loopDataset.forEach((item: any, i: number) => {
          const itemId = canvasMode === "ECHO" ? item.id : item.stack_id;
          const savedMeta = spatialMetadata[itemId];

          const row = Math.floor(i / 3);
          const col = i % 3;
          const defX = col * 600 + (row % 2 === 0 ? 0 : 300);
          const defY = row * 650;

          const actualX = savedMeta?.x_coord ?? defX;
          const actualY = savedMeta?.y_coord ?? defY;

          if (actualX > maxX) {
            maxX = actualX;
            targetY = actualY;
          }
        });

        const screenW =
          typeof window !== "undefined" ? window.innerWidth : 1200;
        const screenH =
          typeof window !== "undefined" ? window.innerHeight : 800;
        const scale = 0.7;

        const newX = screenW / 2 - maxX * scale;
        const newY = screenH / 2 - targetY * scale;

        if (transformComponentRef.current.setTransform) {
          transformComponentRef.current.setTransform(
            newX,
            newY,
            scale,
            0,
            "easeOutCubic",
          );
        }

        syncCameraState({
          state: {
            scale,
            positionX: newX,
            positionY: newY,
          },
        });
        updateCulling({
          state: {
            scale,
            positionX: newX,
            positionY: newY,
          },
        });
      }
    }
  }, [canvasMode, loopDataset, spatialMetadata, syncCameraState, updateCulling]);

  return {
    transformComponentRef,
    canvasScale,
    cameraPositionX,
    cameraPositionY,
    setCanvasScale,
    cullingRect,
    updateCulling,
  };
}
