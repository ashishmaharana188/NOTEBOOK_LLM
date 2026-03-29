import { useMemo } from "react";

export const CENTER_X = 550;
export const CENTER_Y = 500;
export const ORBITS = {
  library: 110,
  brain: 190,
  echoes: 270,
  notes: 400,
  stacks: 430,
};

export default function useRadialGraphMath({
  graphData,
  activeLayer,
  rotationOffsets,
  hoveredNode,
}: {
  graphData: any;
  activeLayer: string | null;
  rotationOffsets: Record<string, number>;
  hoveredNode: any;
}) {
  // --- DATA PROCESSING WITH VIRTUAL LAZY LOADING & SUB-NODE BRANCHING ---
  const processedGraph = useMemo(() => {
    if (!graphData || !graphData.nodes) return { nodes: [], links: [] };

    // 1. Deep copy the raw data so we can mutate and build a tree structure safely
    const rawNodes = JSON.parse(JSON.stringify(graphData.nodes));
    const rawLinks = JSON.parse(JSON.stringify(graphData.links || []));

    const rawGroups: Record<
      "center" | "library" | "brain" | "echoes" | "notes" | "stacks",
      any[]
    > = {
      center: [],
      library: [],
      brain: [],
      echoes: [],
      notes: [],
      stacks: [],
    };

    // 2. Map nodes by ID and initialize their children arrays
    const nodeMapById = new Map();
    rawNodes.forEach((n: any) => {
      n.children = [];
      nodeMapById.set(n.id, n);
    });

    // 3. Build the Hierarchy (Flat to Tree)
    rawLinks.forEach((link: any) => {
      if (link.type !== "implicit") return;

      const source = nodeMapById.get(link.source);
      const target = nodeMapById.get(link.target);

      if (source && target) {
        if (target.group === "stacks") return;

        if (target.group === source.group) {
          target.children.push(source);
          source.isNestedChild = true;
        }
      }
    });

    // 4. Sort Top-Level Nodes (Excluding Nested Children) into their respective Rings
    rawNodes.forEach((n: any) => {
      if (!n.isNestedChild) {
        const group = n.group?.toLowerCase() || "";
        if (n.id === "center" || n.isCenter) {
          rawGroups.center.push(n);
        } else if (group === "library") {
          if (n.hasFile) rawGroups.library.push(n);
          else rawGroups.brain.push(n);
        } else if (group === "brain") {
          rawGroups.brain.push(n);
        } else if (group === "echo") {
          rawGroups.echoes.push(n);
        } else if (group === "stacks") {
          rawGroups.stacks.push(n);
        } else {
          rawGroups.notes.push(n);
        }
      }
    });

    const positionedNodes: any[] = [];
    const syntheticLinks: any[] = [];
    const nodeMap = new Map();

    const addCenter = (n: any) => {
      const c = {
        ...n,
        x: CENTER_X,
        y: CENTER_Y,
        radius: 0,
        angle: 0,
        rotation: 0,
      };
      positionedNodes.push(c);
      nodeMap.set(c.id || "center", c);
    };

    if (rawGroups.center.length > 0) addCenter(rawGroups.center[0]);
    else addCenter({ id: "center", label: "MY LIBRARY", isCenter: true });

    // Recursive function to project subnodes radially
    const placeSubnodes = (
      parentNode: any,
      children: any[],
      depth: number,
      direction: number,
    ) => {
      if (!children || children.length === 0) return;

      const spreadAngle = Math.PI / (6 + depth * 2);

      children.forEach((child, j) => {
        const angleOffset =
          children.length > 1
            ? -spreadAngle / 2 + (spreadAngle / (children.length - 1)) * j
            : 0;

        const childAngle = parentNode.angle + angleOffset;
        const childRadius = parentNode.radius + direction * depth * 25;

        const x = CENTER_X + childRadius * Math.cos(childAngle);
        const y = CENTER_Y + childRadius * Math.sin(childAngle);

        let rotation = (childAngle * 180) / Math.PI;
        const safeRot = ((rotation % 360) + 360) % 360;
        const isFlipped = safeRot > 90 && safeRot < 270;
        if (isFlipped) rotation += 180;

        const positionedChild = {
          ...child,
          uniqueId: child.id || `${parentNode.uniqueId}-sub-${depth}-${j}`,
          x,
          y,
          radius: childRadius,
          angle: childAngle,
          rotation,
          isFlipped,
          layer: parentNode.layer,
          isSubnode: true,
          depth,
          group: parentNode.group || child.group,
        };

        positionedNodes.push(positionedChild);
        nodeMap.set(positionedChild.uniqueId, positionedChild);

        syntheticLinks.push({
          source: parentNode.uniqueId,
          target: positionedChild.uniqueId,
          sourceNode: parentNode,
          targetNode: positionedChild,
          isSynthetic: true,
        });

        const grandChildren = child.children || child.subnodes || [];
        if (grandChildren.length > 0) {
          placeSubnodes(positionedChild, grandChildren, depth + 1, direction);
        }
      });
    };

    const placeNodes = (layerKey: keyof typeof rawGroups, radius: number) => {
      const nodes = rawGroups[layerKey];
      if (!nodes || nodes.length === 0) return;

      const currentRotation = rotationOffsets[layerKey] || 0;
      const projectionDirection = layerKey === "notes" ? -1 : 1;

      const useEvenSpacing = nodes.length <= 15;
      const activeAngleStep = useEvenSpacing
        ? (2 * Math.PI) / Math.max(nodes.length, 1)
        : Math.PI / 12;

      const baseIndex = useEvenSpacing
        ? 0
        : Math.floor(-currentRotation / activeAngleStep);

      const startIdx = useEvenSpacing ? 0 : baseIndex - 8;
      const endIdx = useEvenSpacing ? nodes.length - 1 : baseIndex + 16;

      for (let i = startIdx; i <= endIdx; i++) {
        if (i >= 0 && i < nodes.length) {
          const n = nodes[i];
          const totalAngle = useEvenSpacing
            ? i * activeAngleStep - Math.PI / 2 + currentRotation
            : i * activeAngleStep + currentRotation - Math.PI / 8;

          let normalizedAngle = totalAngle % (2 * Math.PI);
          if (normalizedAngle > Math.PI) normalizedAngle -= 2 * Math.PI;
          if (normalizedAngle < -Math.PI) normalizedAngle += 2 * Math.PI;

          if (
            normalizedAngle > -Math.PI / 1.6 &&
            normalizedAngle < Math.PI / 1.6
          ) {
            const x = CENTER_X + radius * Math.cos(totalAngle);
            const y = CENTER_Y + radius * Math.sin(totalAngle);

            let rotation = (totalAngle * 180) / Math.PI;
            const safeRot = ((rotation % 360) + 360) % 360;
            const isFlipped = safeRot > 90 && safeRot < 270;
            if (isFlipped) rotation += 180;

            const positioned = {
              ...n,
              uniqueId: n.id,
              x,
              y,
              radius,
              angle: totalAngle,
              rotation,
              isFlipped,
              layer: layerKey,
            };

            positionedNodes.push(positioned);
            nodeMap.set(n.id, positioned);

            if (n.children && n.children.length > 0) {
              placeSubnodes(positioned, n.children, 1, projectionDirection);
            }
          }
        }
      }
    };

    placeNodes("library", ORBITS.library);
    placeNodes("brain", ORBITS.brain);
    placeNodes("echoes", ORBITS.echoes);
    placeNodes("notes", ORBITS.notes);
    placeNodes("stacks", ORBITS.stacks);

    const positionedLinks = rawLinks
      .map((l: any) => {
        const source = nodeMap.get(l.source);
        const target = nodeMap.get(l.target);
        if (source && target)
          return { ...l, sourceNode: source, targetNode: target };
        return null;
      })
      .filter(Boolean);

    return {
      nodes: positionedNodes,
      links: [...positionedLinks, ...syntheticLinks],
    };
  }, [graphData, activeLayer, rotationOffsets]);

  // --- DIRECT HOVER CONNECTIONS ONLY ---
  const { connectedNodes, connectedLinks } = useMemo(() => {
    if (!hoveredNode || !processedGraph.links) {
      return { connectedNodes: new Set(), connectedLinks: new Set() };
    }

    const startId = hoveredNode.uniqueId || hoveredNode.id;
    const cNodes = new Set([startId]);
    const cLinks = new Set();

    processedGraph.links.forEach((l: any) => {
      const s = l.sourceNode?.uniqueId || l.source;
      const t = l.targetNode?.uniqueId || l.target;
      if (s === startId || t === startId) {
        cLinks.add(l);
        cNodes.add(s);
        cNodes.add(t);
      }
    });

    return { connectedNodes: cNodes, connectedLinks: cLinks };
  }, [hoveredNode, processedGraph.links]);

  return {
    processedGraph,
    connectedNodes,
    connectedLinks,
    CENTER_X,
    CENTER_Y,
    ORBITS,
  };
}
