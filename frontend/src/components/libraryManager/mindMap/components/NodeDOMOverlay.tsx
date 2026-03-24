import React from "react";

interface NodeDOMOverlayProps {
  activeLayer: string | null;
  processedGraph: { nodes: any[]; links: any[] };
  connectedNodes: Set<any>;
  hoveredNode: any;
  setSelectedNode: (node: any) => void;
  setHoveredNode: (node: any) => void;
  CENTER_X: number;
  CENTER_Y: number;
}

const NodeDOMOverlay: React.FC<NodeDOMOverlayProps> = React.memo(
  ({
    activeLayer,
    processedGraph,
    connectedNodes,
    hoveredNode,
    setSelectedNode,
    setHoveredNode,
    CENTER_X,
    CENTER_Y,
  }) => {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {processedGraph.nodes.map((node: any) => {
          const isCenter = node.radius === 0;
          const isNotActiveLayer = activeLayer && node.layer !== activeLayer;
          const isHoveredFocus =
            hoveredNode &&
            connectedNodes &&
            connectedNodes.size > 0 &&
            connectedNodes.has(node.uniqueId || node.id);
          const shouldDimForHover =
            hoveredNode && connectedNodes.size > 0 && !isHoveredFocus;

          let dotColor = "bg-rose-500";
          if (node.group === "library") dotColor = "bg-emerald-500";
          else if (node.group === "brain") dotColor = "bg-black";
          else if (node.group === "echo") dotColor = "bg-rose-700";
          else if (node.group === "notes") dotColor = "bg-blue-500";
          else if (node.group === "stacks") dotColor = "bg-amber-500";

          if (isCenter) {
            return (
              <div
                key={node.uniqueId}
                className={`graph-node absolute flex items-center justify-center w-24 h-24 bg-gray-900 rounded-full border-4 border-gray-100 shadow-[0_0_20px_rgba(0,0,0,0.2)] z-30 cursor-pointer pointer-events-auto transition-all duration-500 ${
                  activeLayer ? "scale-50 opacity-50" : "scale-100 opacity-100"
                }`}
                style={{ left: node.x - 48, top: node.y - 48 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.group !== "brain") {
                    setSelectedNode(node);
                  }
                }}
              >
                <span className="text-white text-[8px] font-bold tracking-[0.2em] uppercase text-center">
                  MY LIBRARY
                </span>
              </div>
            );
          }

          return (
            <div
              key={node.uniqueId}
              className={`group graph-node absolute z-20 hover:z-[100] transition-opacity duration-300 ${
                isNotActiveLayer
                  ? "opacity-20 pointer-events-none grayscale"
                  : shouldDimForHover
                    ? "pointer-events-auto opacity-25"
                  : "pointer-events-auto opacity-100"
              }`}
              style={{
                left: node.x,
                top: node.y,
                transform: `rotate(${node.rotation}deg)`,
              }}
              onMouseEnter={() => setHoveredNode(node)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode(node);
              }}
            >
              <div
                className={`absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 bg-surface border border-gray-300 flex items-center justify-center shadow-sm group-hover:scale-125 transition-all duration-300 cursor-pointer ${
                  node.isSubnode ? "w-3 h-3 rounded-sm" : "w-5 h-5"
                } ${isHoveredFocus ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-white" : ""}`}
              >
                <div
                  className={`${
                    node.isSubnode ? "w-1.5 h-1.5" : "w-2.5 h-2.5"
                  } rounded-full ${dotColor}`}
                ></div>
              </div>

              <span
                className={`absolute top-0 -translate-y-1/2 font-bold uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 group-hover:bg-surface/95 group-hover:shadow-lg group-hover:px-2 group-hover:py-0.5 group-hover:rounded transition-all duration-300 whitespace-nowrap pointer-events-none ${
                  node.isSubnode
                    ? "text-[8px] text-muted"
                    : "text-[10px] text-gray-800"
                } ${node.isFlipped ? "right-6 text-right" : "left-6 text-left"}`}
              >
                {node.label || node.title}
              </span>
            </div>
          );
        })}
      </div>
    );
  },
);

export default NodeDOMOverlay;
