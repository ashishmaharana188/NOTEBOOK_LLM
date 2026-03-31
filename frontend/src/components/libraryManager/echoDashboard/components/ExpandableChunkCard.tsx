import React from "react";
import type { EchoChunk } from "../echoTypes";

export default function ExpandableChunkCard({
  chunk,
  onOpenReader,
}: {
  chunk: EchoChunk;
  onOpenReader?: () => void;
}) {
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenReader?.();
  };

  return (
    <div className="mt-4">
      <button
        onClick={handleExpand}
        className="px-0 py-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 transition-colors hover:text-slate-900"
      >
        Read Full Context
      </button>
    </div>
  );
}
