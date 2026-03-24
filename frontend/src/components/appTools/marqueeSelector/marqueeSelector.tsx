import React, { useState } from "react";

interface MarqueeSelectorProps {
  isShiftDown: boolean;
  canvasScale: number;
  cameraPositionX: number;
  cameraPositionY: number;
  viewportRef: React.RefObject<HTMLElement | null>;
  onSelectionComplete: (bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    screenLeft: number;
    screenRight: number;
    screenTop: number;
    screenBottom: number;
  }) => void;
  onCancel: () => void;
}

export default function MarqueeSelector({
  isShiftDown,
  canvasScale,
  cameraPositionX,
  cameraPositionY,
  viewportRef,
  onSelectionComplete,
  onCancel,
}: MarqueeSelectorProps) {
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startClientX: number;
    startClientY: number;
    endClientX: number;
    endClientY: number;
  } | null>(null);

  if (!isShiftDown) return null;

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: (clientX - rect.left - cameraPositionX) / canvasScale,
      y: (clientY - rect.top - cameraPositionY) / canvasScale,
    };
  };

  return (
    <>
      {/* Drag Capture Overlay */}
      <div
        className="no-pan absolute z-[9999] cursor-crosshair"
        style={{
          left: -15000,
          top: -15000,
          width: 30000,
          height: 30000,
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const point = getCanvasPoint(e.clientX, e.clientY);
          if (!point) return;
          setSelectionBox({
            startX: point.x,
            startY: point.y,
            endX: point.x,
            endY: point.y,
            startClientX: e.clientX,
            startClientY: e.clientY,
            endClientX: e.clientX,
            endClientY: e.clientY,
          });
        }}
        onPointerMove={(e) => {
          if (!selectionBox) return;
          const point = getCanvasPoint(e.clientX, e.clientY);
          if (!point) return;
          setSelectionBox((prev) => ({
            ...prev!,
            endX: point.x,
            endY: point.y,
            endClientX: e.clientX,
            endClientY: e.clientY,
          }));
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (selectionBox) {
            onSelectionComplete({
              left: Math.min(selectionBox.startX, selectionBox.endX),
              right: Math.max(selectionBox.startX, selectionBox.endX),
              top: Math.min(selectionBox.startY, selectionBox.endY),
              bottom: Math.max(selectionBox.startY, selectionBox.endY),
              screenLeft: Math.min(
                selectionBox.startClientX,
                selectionBox.endClientX,
              ),
              screenRight: Math.max(
                selectionBox.startClientX,
                selectionBox.endClientX,
              ),
              screenTop: Math.min(
                selectionBox.startClientY,
                selectionBox.endClientY,
              ),
              screenBottom: Math.max(
                selectionBox.startClientY,
                selectionBox.endClientY,
              ),
            });
          }
          setSelectionBox(null);
          onCancel();
        }}
      />

      {/* The Visual Selection Box */}
      {selectionBox && (
        <div
          className="absolute z-[10000] pointer-events-none rounded-sm border-[3px] border-blue-500 bg-blue-500/10"
          style={{
            boxSizing: "border-box", // <-- THE FIX: Prevents borders from blowing out the layout
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.max(
              1,
              Math.abs(selectionBox.endX - selectionBox.startX),
            ), // Prevent 0-width bugs
            height: Math.max(
              1,
              Math.abs(selectionBox.endY - selectionBox.startY),
            ),
          }}
        />
      )}
    </>
  );
}
