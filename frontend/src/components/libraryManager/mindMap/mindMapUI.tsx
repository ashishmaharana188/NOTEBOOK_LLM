import React, { useEffect, useRef } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { animate, stagger } from "animejs";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import OrbitLayersLegend from "./components/OrbitLayersLegend";
import MindMapControls from "./components/MindMapControls";
import InspectorPanel from "./components/InspectorPanel";
import RadialSVGPaths from "./components/RadialSVGPaths";
import NodeDOMOverlay from "./components/NodeDOMOverlay";
import useMindMapState from "./hooks/useMindMapState";

export default function MindMapUI() {
  const state = useMindMapState();
  const svgRef = useRef<SVGSVGElement>(null);

  // Animate nodes on initial load
  useEffect(() => {
    if (!state.loading && state.processedGraph.nodes.length > 0) {
      animate(".graph-node", {
        opacity: [0, 1],
        scale: [0.8, 1],
        duration: 800,
        delay: stagger(20),
        ease: "outBack",
      });
    }
  }, [state.loading, state.processedGraph.nodes.length]);

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[850px] bg-surface border border-border-subtle">
        <div className="w-10 h-10 border-4 border-gray-800 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-muted font-bold tracking-[0.2em] text-sm uppercase">
          Mapping Spatial Architecture...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[850px] overflow-hidden relative font-sans select-none bg-[#fdfdfd] border border-border-subtle">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(#9ca3af 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      ></div>

      <div
        className={`absolute top-6 left-8 z-10 pointer-events-none transition-opacity duration-500 ${
          state.activeLayer ? "opacity-0" : "opacity-100"
        }`}
      >
        <h1 className="text-xl font-bold text-primary tracking-[0.1em] uppercase">
          Cognitive Echo Canvas
        </h1>
        <p className="text-[10px] text-muted tracking-[0.2em] uppercase mt-1">
          Spatial Knowledge Architecture
        </p>
      </div>

      {state.activeLayer && (
        <button
          onClick={() => state.setActiveLayer(null)}
          className="absolute top-6 left-8 z-50 bg-surface border border-gray-300 shadow-md px-4 py-2 flex items-center gap-2 hover:bg-canvas transition-all animate-in fade-in slide-in-from-top-4"
        >
          <ArrowPathIcon className="w-4 h-4 text-gray-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-gray-800">
            Reset View
          </span>
        </button>
      )}

      <OrbitLayersLegend activeLayer={state.activeLayer} />

      <div className="absolute inset-0 z-0">
        <TransformWrapper
          initialScale={1}
          minScale={0.2}
          maxScale={4}
          centerOnInit={true}
          wheel={{ disabled: !!state.activeLayer }}
          panning={{ disabled: !!state.activeLayer }}
          limitToBounds={false}
        >
          {() => (
            <>
              <MindMapControls activeLayer={state.activeLayer} />

              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
              >
                <div
                  className="relative"
                  style={{
                    width: state.CENTER_X * 2,
                    height: state.CENTER_Y * 2,
                  }}
                  onWheel={state.handleWheel}
                >
                  {/* Invisible Anchors for Auto-Zooming */}
                  {Object.entries(state.ORBITS).map(([key, radius]) => (
                    <div
                      key={`anchor-${key}`}
                      id={`zoom-anchor-${key}`}
                      className="absolute w-1 h-1 pointer-events-none"
                      style={{
                        left: state.CENTER_X + radius,
                        top: state.CENTER_Y,
                      }}
                    />
                  ))}

                  <RadialSVGPaths
                    svgRef={svgRef}
                    activeLayer={state.activeLayer}
                    setActiveLayer={state.setActiveLayer}
                    processedGraph={state.processedGraph}
                    connectedLinks={state.connectedLinks}
                    hoveredNode={state.hoveredNode}
                    ORBITS={state.ORBITS}
                    CENTER_X={state.CENTER_X}
                    CENTER_Y={state.CENTER_Y}
                  />

                  <NodeDOMOverlay
                    activeLayer={state.activeLayer}
                    processedGraph={state.processedGraph}
                    connectedNodes={state.connectedNodes}
                    hoveredNode={state.hoveredNode}
                    setSelectedNode={state.setSelectedNode}
                    setHoveredNode={state.setHoveredNode}
                    CENTER_X={state.CENTER_X}
                    CENTER_Y={state.CENTER_Y}
                  />
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {state.selectedNode && (
        <InspectorPanel
          selectedNode={state.selectedNode}
          onClose={() => state.setSelectedNode(null)}
        />
      )}
    </div>
  );
}
