export interface FocusBlock {
  id: string;
  text: string;
}

const BLOCK_BREAK = /\n\s*\n+/g;

function sanitizeInlineWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/\t/g, " ").trim();
}

export function stripHtmlToText(input: string) {
  const raw = String(input || "");
  if (!raw) return "";

  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function splitLongBlock(text: string, blockId: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [{ id: `${blockId}-0`, text }];
  }

  const groups: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > 520 && current) {
      groups.push(current);
      current = sentence;
      return;
    }
    current = next;
  });

  if (current) {
    groups.push(current);
  }

  return groups.map((group, index) => ({
    id: `${blockId}-${index}`,
    text: group,
  }));
}

export function splitIntoFocusBlocks(input: string) {
  const cleaned = sanitizeInlineWhitespace(stripHtmlToText(input));
  if (!cleaned) return [] as FocusBlock[];

  const seedBlocks = cleaned
    .split(BLOCK_BREAK)
    .map((block) => sanitizeInlineWhitespace(block))
    .filter(Boolean);

  if (!seedBlocks.length) {
    return [{ id: "block-0", text: cleaned }];
  }

  const blocks: FocusBlock[] = [];
  seedBlocks.forEach((block, index) => {
    if (block.length > 700) {
      blocks.push(...splitLongBlock(block, `block-${index}`));
      return;
    }
    blocks.push({ id: `block-${index}`, text: block });
  });

  return blocks;
}
