import { useMemo } from "react";
import { extractStickiesFromTags } from "../utils/stickyData";

export default function useCoverStickies(
  orbitingItems: any[],
  isExpanded: boolean,
  isVisible: boolean,
) {
  return useMemo(() => {
    if (isExpanded || !isVisible) return [];
    const stickies: any[] = [];
    orbitingItems.slice(0, 12).forEach((item: any) => {
      extractStickiesFromTags(item.tags).forEach((sticky: any) => {
        if (sticky?.text && sticky.text.trim().length > 0) {
          stickies.push(sticky);
        }
      });
    });
    return stickies;
  }, [orbitingItems, isExpanded, isVisible]);
}
