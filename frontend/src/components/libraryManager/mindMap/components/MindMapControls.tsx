import React, { useEffect } from "react";
import { useControls } from "react-zoom-pan-pinch";

const MindMapControls = ({ activeLayer }: { activeLayer: string | null }) => {
  const { zoomToElement, resetTransform } = useControls();

  useEffect(() => {
    if (activeLayer) {
      zoomToElement(`zoom-anchor-${activeLayer}`, 2.5, 800, "easeOutExpo");
    } else {
      resetTransform(800, "easeOutExpo");
    }
  }, [activeLayer, resetTransform, zoomToElement]);

  return null;
};

export default MindMapControls;
