type StickyRecord = {
  id?: string | number;
  styleClass?: string;
  text?: string;
};

const STICKY_MARKER = "sticky_data:";

export function extractStickiesFromTags(tags: unknown): StickyRecord[] {
  const tagString = String(tags || "");
  const markerIndex = tagString.indexOf(STICKY_MARKER);
  if (markerIndex === -1) return [];

  const rawJson = tagString.slice(markerIndex + STICKY_MARKER.length).trim();
  if (!rawJson) return [];

  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const hasText = typeof item.text === "string";
      const hasStyle = typeof item.styleClass === "string";
      const hasId =
        typeof item.id === "string" || typeof item.id === "number";
      return hasText || hasStyle || hasId;
    });
  } catch {
    return [];
  }
}

export function stripStickyDataFromTags(tags: unknown): string {
  const tagString = String(tags || "");
  const markerIndex = tagString.indexOf(STICKY_MARKER);
  if (markerIndex === -1) return tagString.trim();
  return tagString.slice(0, markerIndex).trim();
}
