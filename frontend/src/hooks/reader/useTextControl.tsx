// frontend/src/hooks/reader/useTextControl.ts
import { useState } from "react";

export function useTextControl(content: string = "") {
  const [pageIndex, setPageIndex] = useState(0);

  // Simple 2500 char chunking
  const pages = content ? content.match(/.{1,2500}/gs) || [content] : [];

  const actions = {
    next: () => setPageIndex((p) => Math.min(p + 1, pages.length - 1)),
    prev: () => setPageIndex((p) => Math.max(p - 1, 0)),
  };

  return { pages, pageIndex, actions };
}
