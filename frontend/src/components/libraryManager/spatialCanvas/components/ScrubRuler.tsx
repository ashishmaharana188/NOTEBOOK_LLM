import React, { useState } from "react";

const ScrubRuler = ({
  direction,
  totalItems,
  pageIndex,
  setPageIndex,
}: any) => {
  const maxPage = Math.max(0, Math.ceil(totalItems / 12) - 1);
  const [rulerBase, setRulerBase] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.type === "pointerdown") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
    }

    if (!isDragging && e.type !== "pointerdown") return;

    // Calculate which notch the mouse is hovering over
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, y / rect.height));
    const notchIndex = Math.round(percentage * 4); // 0 to 4
    let targetPage = rulerBase + notchIndex;

    // Stop jumping if we reached the maximum available cards
    if (targetPage > maxPage) targetPage = maxPage;

    // Live Scrubbing
    if (pageIndex !== targetPage) {
      setPageIndex(targetPage);
    }

    // Shift the ruler when releasing the mouse on the edges
    if (e.type === "pointerup" || e.type === "pointercancel") {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (notchIndex === 4 && targetPage < maxPage) {
        setRulerBase(targetPage); // Jump the 5th line to the top
      } else if (notchIndex === 0 && targetPage > 0) {
        setRulerBase(Math.max(0, targetPage - 4)); // Jump the 1st line to the bottom
      }
    }
  };

  // If cards scatter left, A3 is on the right -> Slider goes on the Right edge.
  const isRight = direction === "LEFT";

  return (
    <div
      className={`no-pan absolute top-1/2 -translate-y-1/2 ${
        isRight ? "-right-16" : "-left-16"
      } h-64 w-10 flex justify-center z-[6000] cursor-ns-resize touch-none group`}
      onPointerDown={handlePointerEvent}
      onPointerMove={handlePointerEvent}
      onPointerUp={handlePointerEvent}
      onPointerCancel={handlePointerEvent}
    >
      <div className="absolute top-0 bottom-0 w-1 bg-slate-200 rounded-full pointer-events-none transition-colors group-hover:bg-slate-300" />
      {[0, 1, 2, 3, 4].map((notch) => {
        const pageValue = rulerBase + notch;
        const isActive = pageValue === pageIndex;
        const isAvailable = pageValue <= maxPage;

        return (
          <div
            key={notch}
            className="absolute w-4 h-1 transition-all duration-150 pointer-events-none rounded-full"
            style={{
              top: `${(notch / 4) * 100}%`,
              width: isActive ? "24px" : "12px",
              backgroundColor: isActive
                ? "#ec4899"
                : isAvailable
                  ? "#94a3b8"
                  : "#e2e8f0",
              transform: "translateY(-50%)",
            }}
          >
            <span
              className={`absolute ${
                isRight ? "left-6" : "right-8"
              } top-1/2 -translate-y-1/2 text-[10px] font-bold font-mono transition-colors ${
                isActive
                  ? "text-pink-500"
                  : isAvailable
                    ? "text-slate-400"
                    : "text-slate-300/50"
              }`}
            >
              {pageValue + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default ScrubRuler;
