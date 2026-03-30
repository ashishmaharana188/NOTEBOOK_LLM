import React from "react";

export type EchoMarker = {
    marker_id?: string;
    quote?: string;
    prefix?: string;
    suffix?: string;
    start_offset?: number;
    end_offset?: number;
    context_variant?: "excerpt" | "full";
    linked_cluster_id?: string;
    linked_echo_id?: string;
    mode?: string;
    saved_at?: string;
};

export function markersMatch(
    left?: EchoMarker | null,
    right?: EchoMarker | null,
) {
    if (!left || !right) return false;

    const leftId = String(left.marker_id || "").trim();
    const rightId = String(right.marker_id || "").trim();
    if (leftId && rightId && leftId === rightId) {
        return true;
    }

    const leftQuote = String(left.quote || "").trim();
    const rightQuote = String(right.quote || "").trim();
    if (!leftQuote || !rightQuote || leftQuote !== rightQuote) {
        return false;
    }

    const leftStart = Number(left.start_offset);
    const rightStart = Number(right.start_offset);
    const leftEnd = Number(left.end_offset);
    const rightEnd = Number(right.end_offset);
    if (
        Number.isFinite(leftStart) &&
        Number.isFinite(rightStart) &&
        Number.isFinite(leftEnd) &&
        Number.isFinite(rightEnd)
    ) {
        return leftStart === rightStart && leftEnd === rightEnd;
    }

    return (
        String(left.prefix || "") === String(right.prefix || "") &&
        String(left.suffix || "") === String(right.suffix || "")
    );
}

export function createMarkerFromQuote(
    sourceText: string,
    quote: string,
    contextVariant: "excerpt" | "full",
): EchoMarker | null {
    const trimmedQuote = String(quote || "").trim();
    if (!trimmedQuote) return null;

    const matchIndex = String(sourceText || "").indexOf(trimmedQuote);
    if (matchIndex >= 0) {
        const matchEnd = matchIndex + trimmedQuote.length;
        return {
            marker_id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            quote: trimmedQuote,
            prefix: sourceText.slice(Math.max(0, matchIndex - 32), matchIndex),
            suffix: sourceText.slice(matchEnd, Math.min(sourceText.length, matchEnd + 32)),
            start_offset: matchIndex,
            end_offset: matchEnd,
            context_variant: contextVariant,
        };
    }

    return {
        marker_id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        quote: trimmedQuote,
        prefix: "",
        suffix: "",
        context_variant: contextVariant,
    };
}

type ResolvedMarkerRange = {
    start: number;
    end: number;
    marker: EchoMarker;
};

function getTextNodes(root: Node): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let current = walker.nextNode();
    while (current) {
        nodes.push(current as Text);
        current = walker.nextNode();
    }
    return nodes;
}

function getOffsetInRoot(root: HTMLElement, targetNode: Node, targetOffset: number) {
    let offset = 0;
    for (const node of getTextNodes(root)) {
        if (node === targetNode) {
            return offset + targetOffset;
        }
        offset += node.textContent?.length || 0;
    }
    return offset;
}

function resolveMarkerRange(text: string, marker: EchoMarker): ResolvedMarkerRange | null {
    const quote = String(marker.quote || "").trim();
    if (!quote) return null;

    const startOffset = Number(marker.start_offset);
    const endOffset = Number(marker.end_offset);
    if (
        Number.isFinite(startOffset) &&
        Number.isFinite(endOffset) &&
        startOffset >= 0 &&
        endOffset > startOffset &&
        text.slice(startOffset, endOffset) === quote
    ) {
        return { start: startOffset, end: endOffset, marker };
    }

    const prefix = String(marker.prefix || "");
    const suffix = String(marker.suffix || "");
    let searchStart = 0;
    while (searchStart < text.length) {
        const matchIndex = text.indexOf(quote, searchStart);
        if (matchIndex < 0) break;
        const matchEnd = matchIndex + quote.length;
        const prefixMatches = !prefix || text.slice(Math.max(0, matchIndex - prefix.length), matchIndex) === prefix;
        const suffixMatches = !suffix || text.slice(matchEnd, Math.min(text.length, matchEnd + suffix.length)) === suffix;
        if (prefixMatches && suffixMatches) {
            return { start: matchIndex, end: matchEnd, marker };
        }
        searchStart = matchIndex + 1;
    }

    return null;
}

export function createMarkerFromSelection(
    root: HTMLElement | null,
    sourceText: string,
    contextVariant: "excerpt" | "full",
): EchoMarker | null {
    if (!root) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const quote = selection.toString();
    if (!quote.trim()) return null;

    const startNode = range.startContainer;
    const endNode = range.endContainer;
    if (!root.contains(startNode) || !root.contains(endNode)) {
        return null;
    }

    const start = getOffsetInRoot(root, startNode, range.startOffset);
    const end = getOffsetInRoot(root, endNode, range.endOffset);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return createMarkerFromQuote(sourceText, quote, contextVariant);
    }

    const resolvedQuote = sourceText.slice(start, end) || quote;
    return {
        marker_id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        quote: resolvedQuote,
        prefix: sourceText.slice(Math.max(0, start - 32), start),
        suffix: sourceText.slice(end, Math.min(sourceText.length, end + 32)),
        start_offset: start,
        end_offset: end,
        context_variant: contextVariant,
    };
}

export function renderMarkedText(
    text: string,
    markers: EchoMarker[] = [],
    pendingMarker?: EchoMarker | null,
    keyPrefix = "marker",
) {
    const allMarkers = [...(markers || [])];
    if (pendingMarker?.quote) {
        allMarkers.unshift(pendingMarker);
    }

    const resolvedRanges = allMarkers
        .map((marker) => resolveMarkerRange(text, marker))
        .filter((value): value is ResolvedMarkerRange => Boolean(value))
        .sort((left, right) => left.start - right.start);

    if (resolvedRanges.length === 0) {
        return text;
    }

    const mergedRanges: ResolvedMarkerRange[] = [];
    for (const nextRange of resolvedRanges) {
        const previous = mergedRanges[mergedRanges.length - 1];
        if (!previous || nextRange.start > previous.end) {
            mergedRanges.push(nextRange);
            continue;
        }
        previous.end = Math.max(previous.end, nextRange.end);
    }

    const fragments: React.ReactNode[] = [];
    let cursor = 0;
    mergedRanges.forEach((range, index) => {
        if (range.start > cursor) {
            fragments.push(
                <React.Fragment key={`${keyPrefix}-text-${index}-${cursor}`}>
                    {text.slice(cursor, range.start)}
                </React.Fragment>,
            );
        }
        fragments.push(
            <mark
                key={`${keyPrefix}-mark-${index}-${range.start}`}
                className="bg-[#f3dd73] text-slate-900"
            >
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });
    if (cursor < text.length) {
        fragments.push(
            <React.Fragment key={`${keyPrefix}-tail-${cursor}`}>
                {text.slice(cursor)}
            </React.Fragment>,
        );
    }
    return fragments;
}
