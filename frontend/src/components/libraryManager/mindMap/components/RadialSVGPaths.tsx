import React from "react";

interface RadialSVGPathsProps {
  svgRef: React.RefObject<SVGSVGElement>;
  activeLayer: string | null;
  setActiveLayer: (layer: string | null) => void;
  processedGraph: { links: any[]; nodes: any[] };
  connectedLinks: Set<any>;
  hoveredNode: any;
  ORBITS: Record<string, number>;
  CENTER_X: number;
  CENTER_Y: number;
}

const RadialSVGPaths: React.FC<RadialSVGPathsProps> = React.memo(
  ({
    svgRef,
    activeLayer,
    setActiveLayer,
    processedGraph,
    connectedLinks,
    hoveredNode,
    ORBITS,
    CENTER_X,
    CENTER_Y,
  }) => {
    return (
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
      >
        {/* RENDER ORBIT RINGS */}
        {Object.entries(ORBITS).map(([key, radius]) => {
          const isActive = activeLayer === key;
          const isAnotherLayerActive = activeLayer && activeLayer !== key;
          return (
            <g key={key}>
              <circle
                className={`transition-all duration-700 ${
                  isActive
                    ? "stroke-amber-500 stroke-[3px] opacity-100"
                    : isAnotherLayerActive
                      ? "stroke-slate-300 stroke-[1px] opacity-20"
                      : "stroke-slate-300 stroke-[1.5px] opacity-40"
                }`}
                cx={CENTER_X}
                cy={CENTER_Y}
                r={radius}
                fill="none"
                strokeDasharray={isActive ? "0" : "6 6"}
              />
              {/* INVISIBLE CLICKABLE HITBOX FOR ORBITS */}
              <circle
                className="cursor-pointer pointer-events-auto"
                cx={CENTER_X}
                cy={CENTER_Y}
                r={radius}
                fill="none"
                stroke="transparent"
                strokeWidth={24}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveLayer(isActive ? null : key);
                }}
              />
            </g>
          );
        })}

        {/* RENDER SYNAPSE LINKS */}
        {processedGraph.links.map((link: any, idx: number) => {
          const isHoveredPath = hoveredNode && connectedLinks.has(link);
          const isNotActiveLayer =
            activeLayer &&
            link.sourceNode.layer !== activeLayer &&
            link.targetNode.layer !== activeLayer;

          const isCrossLink = link.type === "cross_link";
          const isManualLink = link.type === "manual_link";
          const isCompoundLink = link.type === "compound_link";
          const isPollination = link.type === "cross_pollination";
          const isRelational =
            isCrossLink || isManualLink || isCompoundLink || isPollination;

          let strokeColor = "var(--color-border-subtle, #cbd5e1)";
          if (isHoveredPath) {
            strokeColor = isRelational
              ? "var(--color-accent, #8b5cf6)"
              : "var(--color-primary, #64748b)";
          } else if (isManualLink) {
            strokeColor = "var(--color-accent, #0f766e)";
          } else if (isCrossLink) {
            strokeColor = "var(--color-accent, #a78bfa)";
          } else if (isCompoundLink) {
            strokeColor = "var(--color-accent, #f43f5e)";
          } else if (isPollination) {
            strokeColor = "var(--color-accent, #10b981)";
          } else if (link.isSynthetic) {
            strokeColor = "var(--color-border-subtle, #e2e8f0)";
          }

          return (
            <line
              key={`link-${idx}`}
              className="transition-all duration-300"
              x1={link.sourceNode.x}
              y1={link.sourceNode.y}
              x2={link.targetNode.x}
              y2={link.targetNode.y}
              stroke={strokeColor}
              strokeWidth={
                isHoveredPath
                  ? isRelational
                    ? 3
                    : 2
                  : isRelational
                    ? 2
                    : link.isSynthetic
                      ? 1
                      : 1.5
              }
              strokeDasharray={
                isManualLink
                  ? "0"
                  : isCrossLink
                  ? "4 4"
                  : isCompoundLink
                    ? "2 2"
                    : link.isSynthetic
                      ? "3 3"
                      : "0"
              }
              opacity={
                isNotActiveLayer
                  ? 0.05
                  : activeLayer
                    ? isRelational
                      ? 0.8
                      : 0.4
                    : isRelational
                      ? 0.7
                      : 1
              }
              style={isRelational ? { zIndex: 10 } : {}}
            />
          );
        })}
      </svg>
    );
  },
);

export default RadialSVGPaths;
