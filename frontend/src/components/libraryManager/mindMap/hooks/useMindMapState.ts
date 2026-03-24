import { useState, useCallback, useEffect } from "react";
import useMindMap from "../../../../hooks/libraryManager/useMindMap";
import useRadialGraphMath from "./useRadialGraphMath";

export default function useMindMapState() {
  const { graphData, loading } = useMindMap();

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);

  // Interaction State
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [rotationOffsets, setRotationOffsets] = useState<
    Record<string, number>
  >({
    library: 0,
    brain: 0,
    echoes: 0,
    notes: 0,
    stacks: 0,
  });

  // Calculate all math based on current state
  const math = useRadialGraphMath({
    graphData,
    activeLayer,
    rotationOffsets,
    hoveredNode,
  });

  // --- WHEEL HANDLER FOR CHUNKED ROTATION ---
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (activeLayer) {
        const delta = e.deltaY * -0.035;
        setRotationOffsets((prev) => ({
          ...prev,
          [activeLayer]: (prev[activeLayer] || 0) + delta,
        }));
      }
    },
    [activeLayer],
  );

  useEffect(() => {
    if (!math.processedGraph.nodes.length) return;

    const pendingRaw = sessionStorage.getItem("pendingMindMapAction");
    if (!pendingRaw) return;

    try {
      const pending = JSON.parse(pendingRaw);
      const targetId = String(pending?.nodeId || "");
      if (!targetId) return;

      const targetNode = math.processedGraph.nodes.find(
        (node: any) => String(node.id || node.uniqueId) === targetId,
      );
      if (!targetNode) return;

      setSelectedNode(targetNode);
      setHoveredNode(targetNode);
      sessionStorage.removeItem("pendingMindMapAction");
    } catch (error) {
      console.error("Failed to restore pending mind map focus", error);
      sessionStorage.removeItem("pendingMindMapAction");
    }
  }, [math.processedGraph.nodes]);

  return {
    loading,
    selectedNode,
    setSelectedNode,
    hoveredNode,
    setHoveredNode,

    activeLayer,
    setActiveLayer,
    handleWheel,
    ...math,
  };
}
