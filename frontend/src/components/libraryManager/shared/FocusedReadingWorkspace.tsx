import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  BookmarkSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilSquareIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import FocusBlockReader from "../../reader/FocusBlockReader";
import RichDocumentReader from "../../reader/RichDocumentReader";
import useIsMobile from "../../../hooks/appTools/useIsMobile";
import { buildApiUrl } from "../../../lib/runtimeConfig";
import NotesFormUI from "../noteModule/notesFormUI";

export interface ReadingWorkspaceItem {
  id: string;
  title: string;
  text: string;
  fullText?: string;
  chapter?: string;
  sourceLabel?: string;
  filename?: string;
  chunkId?: string;
  echoId?: string;
  clusterId?: string;
  sourceAnchorId?: string;
  bookId?: string;
  libraryId?: string;
  kind?: string;
  noteId?: string;
  groupId?: string;
  tags?: string;
  rawContent?: string;
  linkedEchoId?: string;
  attachedImages?: string[];
}

export interface ReadingDerivedPanel {
  id: string;
  clusterId?: string;
  echoId?: string;
  sourceKey?: string;
  mode: string;
  modeLabel: string;
  title: string;
  summary: string;
  bullets: string[];
  followUps: string[];
  contexts: any[];
  localEvidence: any[];
  webEvidence: any[];
  webStatus?: string;
  webMessage?: string;
  prompt?: string;
  includeWeb?: boolean;
  isSaved?: boolean;
  isSaving?: boolean;
  isLoading?: boolean;
  errorMessage?: string;
}

interface FocusedReadingWorkspaceProps {
  workspaceTitle: string;
  workspaceSubtitle?: string;
  items: ReadingWorkspaceItem[];
  initialItemId?: string;
  onClose: () => void;
  savedPanelsBySourceId?: Record<string, ReadingDerivedPanel[]>;
  onRefreshSaved?: () => Promise<void> | void;
  noteStacks?: any[];
  noteGroups?: any[];
  onSaveNote?: (payload: {
    noteId: string;
    previousGroupId: string;
    groupId: string;
    title: string;
    content: string;
    tags: string;
  }) => Promise<void> | void;
}

const RUN_MODE_LABELS: Record<string, string> = {
  rag: "Prompted RAG",
  cross_pollination: "Cross-Pollination",
  friction: "Friction Analysis",
  gap: "Gap Analysis",
};

function trimText(value: any) {
  return String(value || "").trim();
}

function panelSourceKey(panel: ReadingDerivedPanel) {
  return String(panel.sourceKey || panel.echoId || panel.id || "");
}

function normalizeAttachedImages(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.url || item.src || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

export function buildSavedDerivedPanelsBySourceId(clusters: any[] = []) {
  const map: Record<string, ReadingDerivedPanel[]> = {};

  clusters.forEach((cluster: any) => {
    const metadata =
      cluster?.column_metadata && typeof cluster.column_metadata === "object"
        ? cluster.column_metadata
        : {};
    const columnKind = String(metadata.column_kind || "").toLowerCase();
    if (columnKind !== "analysis" && columnKind !== "rag") {
      return;
    }

    const sourceKey = trimText(cluster.source_echo_id) || trimText(cluster.id);
    if (!sourceKey) return;

    const latestChunk = [...(cluster.chunks || [])]
      .reverse()
      .find((chunk: any) => trimText(chunk?.bridge || chunk?.text || chunk?.title));
    const analysisMetadata =
      latestChunk?.analysis_metadata &&
      typeof latestChunk.analysis_metadata === "object"
        ? latestChunk.analysis_metadata
        : {};
    const mode = String(metadata.mode || columnKind || "analysis").toLowerCase();
    const panel: ReadingDerivedPanel = {
      id: `saved:${cluster.id}`,
      clusterId: String(cluster.id || cluster.cluster_id || ""),
      echoId: String(latestChunk?.echo_id || ""),
      sourceKey,
      mode,
      modeLabel:
        trimText(metadata.mode_label) ||
        RUN_MODE_LABELS[mode] ||
        "Derived Analysis",
      title:
        trimText(latestChunk?.title) ||
        trimText(cluster.title) ||
        RUN_MODE_LABELS[mode] ||
        "Derived Analysis",
      summary:
        trimText(latestChunk?.bridge) ||
        trimText(latestChunk?.text) ||
        trimText(latestChunk?.ai_insight),
      bullets: Array.isArray(analysisMetadata.bullets)
        ? analysisMetadata.bullets
        : [],
      followUps: Array.isArray(analysisMetadata.follow_ups)
        ? analysisMetadata.follow_ups
        : [],
      contexts: Array.isArray(analysisMetadata.contexts)
        ? analysisMetadata.contexts
        : [],
      localEvidence: Array.isArray(analysisMetadata.local_evidence)
        ? analysisMetadata.local_evidence
        : [],
      webEvidence: Array.isArray(analysisMetadata.web_evidence)
        ? analysisMetadata.web_evidence
        : [],
      webStatus: trimText(analysisMetadata.web_status) || "saved",
      webMessage:
        trimText(analysisMetadata.web_message) ||
        "Saved derived evidence is available for this source.",
      prompt: trimText(analysisMetadata.prompt),
      includeWeb:
        typeof analysisMetadata.include_web === "boolean"
          ? analysisMetadata.include_web
          : true,
      isSaved: true,
      isSaving: false,
      isLoading: false,
      errorMessage: "",
    };

    if (!map[sourceKey]) {
      map[sourceKey] = [];
    }
    map[sourceKey].push(panel);
  });

  return map;
}

function saveSelectionRefsForItem(item: ReadingWorkspaceItem) {
  return [
    {
      kind: item.echoId ? "echo" : item.kind || "text",
      id: item.echoId || item.id,
      label: item.title || item.sourceLabel || "Focused Item",
      cluster_id: item.clusterId || "",
      echo_id: item.echoId || "",
    },
  ];
}

function deriveContextForItem(item: ReadingWorkspaceItem, selectedText: string) {
  return {
    context_id: `workspace:${item.id}`,
    kind: item.kind || (item.echoId ? "echo" : "text"),
    anchor_id: item.sourceAnchorId || item.clusterId || "",
    title: item.title,
    text: selectedText || item.text || "",
    full_text: item.fullText || "",
    chapter: item.chapter || "",
    source_label: item.sourceLabel || "",
    cluster_id: item.clusterId || "",
    echo_id: item.echoId || "",
    book_id: item.bookId || "",
    library_id: item.libraryId || "",
  };
}

function ReadingWorkspacePanel({
  panel,
  onSave,
}: {
  panel: ReadingDerivedPanel;
  onSave: (panelId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const summaryPreview =
    panel.summary.length > 220 && !isExpanded
      ? `${panel.summary.slice(0, 220).trim()}...`
      : panel.summary;

  return (
    <article className="border-t border-white/10 py-4 text-white first:border-t-0">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55">
              {panel.modeLabel}
            </div>
            <h4 className="mt-2 text-sm font-semibold tracking-[-0.02em] text-white">
              {panel.title}
            </h4>
          </div>
          <button
            onClick={() => onSave(panel.id)}
            disabled={panel.isSaved || panel.isSaving || !panel.summary}
            className="inline-flex h-8 w-8 items-center justify-center text-white/72 transition-colors hover:text-white disabled:opacity-40"
            title={panel.isSaved ? "Saved" : "Save derived result"}
          >
            {panel.isSaving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            ) : (
              <BookmarkSquareIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {panel.prompt ? (
          <div className="mt-3 text-[11px] text-white/55">{panel.prompt}</div>
        ) : null}

        <p className="mt-4 whitespace-pre-wrap font-serif text-[14px] leading-7 text-white/92">
          {summaryPreview || panel.errorMessage || "No summary available yet."}
        </p>

        {panel.bullets.length > 0 ? (
          <ul className="mt-4 space-y-2 text-[13px] leading-6 text-white/72">
            {(isExpanded ? panel.bullets : panel.bullets.slice(0, 2)).map((bullet, index) => (
              <li key={`${panel.id}-bullet-${index}`}>- {bullet}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            {panel.localEvidence.length > 0
              ? `${panel.localEvidence.length} local evidence`
              : "No local evidence"}
            {panel.webEvidence.length > 0
              ? ` • ${panel.webEvidence.length} web sources`
              : ""}
          </div>
          {(panel.localEvidence.length > 0 ||
            panel.webEvidence.length > 0 ||
            panel.followUps.length > 0 ||
            panel.bullets.length > 2 ||
            panel.summary.length > 220) && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/62 transition-colors hover:text-white"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="h-4 w-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-4 w-4" />
                  Expand
                </>
              )}
            </button>
          )}
        </div>

        {isExpanded ? (
          <div className="mt-5 space-y-5 border-t border-white/10 pt-5">
            {panel.localEvidence.length > 0 ? (
              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Local Evidence
                </div>
                <div className="mt-3 space-y-3">
                  {panel.localEvidence.map((item: any, index: number) => (
                    <div
                      key={`${panel.id}-local-${index}`}
                      className="border-t border-white/10 py-3 first:border-t-0"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                        {item.title || item.source_label || item.filename || `Context ${index + 1}`}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-white/78">
                        {item.text || item.snippet || item.summary || "No local evidence text available."}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {panel.webEvidence.length > 0 ? (
              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Web Sources
                </div>
                <div className="mt-3 space-y-3">
                  {panel.webEvidence.map((item: any, index: number) => (
                    <div
                      key={`${panel.id}-web-${index}`}
                      className="border-t border-white/10 py-3 first:border-t-0"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                        {item.title || item.source || `Source ${index + 1}`}
                      </div>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-[11px] text-white/50 underline decoration-white/20 underline-offset-4"
                        >
                          {item.url}
                        </a>
                      ) : null}
                      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-white/78">
                        {item.snippet || item.text || item.summary || "No web evidence text available."}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {panel.followUps.length > 0 ? (
              <section>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Follow-ups
                </div>
                <ul className="mt-3 space-y-2 text-[13px] leading-6 text-white/72">
                  {panel.followUps.map((item, index) => (
                    <li key={`${panel.id}-follow-${index}`}>- {item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function FocusedReadingWorkspace({
  workspaceTitle,
  workspaceSubtitle = "",
  items,
  initialItemId,
  onClose,
  savedPanelsBySourceId = {},
  onRefreshSaved,
  noteStacks = [],
  noteGroups = [],
  onSaveNote,
}: FocusedReadingWorkspaceProps) {
  const isMobile = useIsMobile();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [itemState, setItemState] = useState<ReadingWorkspaceItem[]>(items);
  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItemId || String(items[0]?.id || ""),
  );
  const [selectionText, setSelectionText] = useState("");
  const [ragPrompt, setRagPrompt] = useState("");
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [isMobileRailOpen, setIsMobileRailOpen] = useState(false);
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [isUploadingEchoImage, setIsUploadingEchoImage] = useState(false);
  const [localPanelsBySourceId, setLocalPanelsBySourceId] = useState<
    Record<string, ReadingDerivedPanel[]>
  >({});
  const echoImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setItemState(items);
    setSelectedItemId(initialItemId || String(items[0]?.id || ""));
  }, [initialItemId, items]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    setPortalTarget(document.body);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setIsMobileRailOpen(false);
    setShowPromptInput(false);
  }, [selectedItemId]);

  const itemMap = useMemo(() => {
    const next = new Map<string, ReadingWorkspaceItem>();
    itemState.forEach((item) => next.set(String(item.id), item));
    return next;
  }, [itemState]);

  const selectedItem = itemMap.get(String(selectedItemId)) || itemState[0] || null;
  const editingNoteItem =
    editingNoteItemId ? itemMap.get(String(editingNoteItemId)) || null : null;
  const sourceKey = String(selectedItem?.echoId || selectedItem?.id || "");
  const visibleSavedPanels = savedPanelsBySourceId[sourceKey] || [];
  const visibleLocalPanels = localPanelsBySourceId[sourceKey] || [];
  const visiblePanels = [...visibleSavedPanels, ...visibleLocalPanels];

  useEffect(() => {
    const target = selectedItem;
    if (!target) return;
    if (target.fullText || !target.filename || !target.chunkId) return;

    let isCancelled = false;
    axios
      .post(buildApiUrl("/echo/expand_context"), {
        filename: target.filename,
        chunk_id: target.chunkId,
        window: 4,
      })
      .then((res) => {
        if (isCancelled) return;
        if (res.data?.status === "success" && res.data?.text) {
          setItemState((prev) =>
            prev.map((item) =>
              String(item.id) === String(target.id)
                ? { ...item, fullText: String(res.data.text) }
                : item,
            ),
          );
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [selectedItem]);

  const handleReachedEnd = () => {
    if (!selectedItem) return;
    const currentIndex = itemState.findIndex(
      (item) => String(item.id) === String(selectedItem.id),
    );
    if (currentIndex < 0 || currentIndex >= itemState.length - 1) return;
    setSelectedItemId(String(itemState[currentIndex + 1]?.id || ""));
    setSelectionText("");
    setShowPromptInput(false);
  };

  const runDerivedMode = async (mode: string, prompt = "") => {
    if (!selectedItem) return;

    const selectedText = trimText(selectionText);
    const currentText =
      selectedText || trimText(selectedItem.fullText) || trimText(selectedItem.text);
    if (!currentText) return;

    const panelId = `workspace-derived-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const draftPanel: ReadingDerivedPanel = {
      id: panelId,
      sourceKey,
      mode,
      modeLabel: RUN_MODE_LABELS[mode] || "Derived Analysis",
      title: selectedItem.title || workspaceTitle,
      summary: "",
      bullets: [],
      followUps: [],
      contexts: [],
      localEvidence: [],
      webEvidence: [],
      webStatus: "pending",
      webMessage: mode === "rag" ? "Searching live evidence..." : "",
      prompt,
      includeWeb: true,
      isLoading: true,
      isSaving: false,
      isSaved: false,
      errorMessage: "",
    };

    setLocalPanelsBySourceId((prev) => ({
      ...prev,
      [sourceKey]: [...(prev[sourceKey] || []), draftPanel],
    }));

    try {
      const res = await axios.post(buildApiUrl("/echo/analysis/run"), {
        mode,
        prompt,
        contexts: [deriveContextForItem(selectedItem, selectedText)],
        selection_refs: saveSelectionRefsForItem(selectedItem),
        include_web: true,
        title_hint: selectedItem.title || workspaceTitle,
      });
      const payload = res.data?.data || res.data || {};

      setLocalPanelsBySourceId((prev) => ({
        ...prev,
        [sourceKey]: (prev[sourceKey] || []).map((panel) =>
          panel.id !== panelId
            ? panel
            : {
                ...panel,
                title: payload.title || panel.title,
                modeLabel: payload.mode_label || panel.modeLabel,
                summary: payload.summary || "",
                bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
                followUps: Array.isArray(payload.follow_ups)
                  ? payload.follow_ups
                  : [],
                contexts: Array.isArray(payload.contexts) ? payload.contexts : [],
                localEvidence: Array.isArray(payload.local_evidence)
                  ? payload.local_evidence
                  : [],
                webEvidence: Array.isArray(payload.web_evidence)
                  ? payload.web_evidence
                  : [],
                webStatus: payload.web_status || "ready",
                webMessage:
                  payload.web_message || "No web evidence was returned.",
                prompt: payload.prompt ?? prompt,
                includeWeb:
                  typeof payload.include_web === "boolean"
                    ? payload.include_web
                    : true,
                isLoading: false,
                errorMessage: "",
              },
        ),
      }));
    } catch (error) {
      console.error("Focused reading derived analysis failed", error);
      setLocalPanelsBySourceId((prev) => ({
        ...prev,
        [sourceKey]: (prev[sourceKey] || []).map((panel) =>
          panel.id !== panelId
            ? panel
            : {
                ...panel,
                isLoading: false,
                errorMessage: "The analysis could not be completed right now.",
              },
        ),
      }));
    }
  };

  const handleSavePanel = async (panelId: string) => {
    const panel = visibleLocalPanels.find((item) => item.id === panelId);
    if (!panel || !selectedItem || !panel.summary) return;

    setLocalPanelsBySourceId((prev) => ({
      ...prev,
      [sourceKey]: (prev[sourceKey] || []).map((item) =>
        item.id === panelId ? { ...item, isSaving: true } : item,
      ),
    }));

    try {
      const originText =
        trimText(selectionText) ||
        trimText(selectedItem.fullText) ||
        trimText(selectedItem.text);
      const res = await axios.post(buildApiUrl("/echo/analysis/save"), {
        mode: panel.mode,
        title: panel.title || selectedItem.title || workspaceTitle,
        summary: panel.summary,
        prompt: panel.prompt || "",
        include_web: true,
        contexts: panel.contexts.length
          ? panel.contexts
          : [deriveContextForItem(selectedItem, trimText(selectionText))],
        selection_refs: saveSelectionRefsForItem(selectedItem),
        local_evidence: panel.localEvidence || [],
        web_evidence: panel.webEvidence || [],
        follow_ups: panel.followUps || [],
        source_anchor_ids: [
          selectedItem.sourceAnchorId || selectedItem.clusterId || "",
        ].filter(Boolean),
        parent_cluster_id: selectedItem.clusterId || "",
        source_echo_id: selectedItem.echoId || "",
        target_cluster_id: panel.clusterId || "",
        origin_context: {
          title: selectedItem.title || workspaceTitle,
          text: originText,
          chapter: selectedItem.chapter || "",
          source_label: selectedItem.sourceLabel || workspaceTitle,
          cluster_id: selectedItem.clusterId || "",
          echo_id: selectedItem.echoId || "",
          book_id: selectedItem.bookId || "",
          library_id: selectedItem.libraryId || "",
        },
      });

      if (res.data?.status !== "success") {
        throw new Error(res.data?.message || "Save failed");
      }

      setLocalPanelsBySourceId((prev) => ({
        ...prev,
        [sourceKey]: (prev[sourceKey] || []).map((item) =>
          item.id === panelId
            ? {
                ...item,
                clusterId: String(res.data.cluster_id || ""),
                echoId: String(res.data.echo_id || ""),
                isSaving: false,
                isSaved: true,
              }
            : item,
        ),
      }));
      await onRefreshSaved?.();
    } catch (error) {
      console.error("Failed to save focused reading panel", error);
      setLocalPanelsBySourceId((prev) => ({
        ...prev,
        [sourceKey]: (prev[sourceKey] || []).map((item) =>
          item.id === panelId ? { ...item, isSaving: false } : item,
        ),
      }));
    }
  };

  const currentText =
    trimText(selectedItem?.fullText) || trimText(selectedItem?.text) || "";
  const isRichNoteView =
    String(selectedItem?.kind || "") === "note" &&
    /<[^>]+>/.test(
      String(selectedItem?.rawContent || selectedItem?.fullText || selectedItem?.text || ""),
    );
  const attachedImages = normalizeAttachedImages(
    (selectedItem as any)?.attachedImages ||
      (selectedItem as any)?.analysis_metadata?.attached_images,
  );

  const handleEchoImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    const targetEchoId = String(selectedItem?.echoId || "");
    if (!files.length || !targetEchoId) {
      event.target.value = "";
      return;
    }

    setIsUploadingEchoImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(
          buildApiUrl(`/upload/media/echo/${targetEchoId}`),
          {
            method: "POST",
            body: formData,
          },
        );
        const data = await response.json();
        if (!response.ok || !data?.url) {
          throw new Error(data?.detail || data?.message || "Image upload failed");
        }
        uploadedUrls.push(String(data.url));
      }

      if (uploadedUrls.length > 0) {
        setItemState((prev) =>
          prev.map((item) => {
            if (String(item.id) !== String(selectedItem?.id || "")) return item;
            const existing = normalizeAttachedImages(item.attachedImages);
            const next = [...existing];
            uploadedUrls.forEach((url) => {
              if (!next.includes(url)) {
                next.push(url);
              }
            });
            return {
              ...item,
              attachedImages: next,
            };
          }),
        );
        await onRefreshSaved?.();
      }
    } catch (error) {
      console.error("Failed to upload echo image", error);
    } finally {
      setIsUploadingEchoImage(false);
      event.target.value = "";
    }
  };

  const attachmentGallery =
    attachedImages.length > 0 ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {attachedImages.map((url, index) => (
          <div
            key={`${selectedItem?.id || "attachment"}-${index}`}
            className="overflow-hidden border border-black/10 bg-slate-100"
          >
            <img
              src={url}
              alt={`${selectedItem?.title || "Echo"} attachment ${index + 1}`}
              className="h-auto w-full object-contain"
            />
          </div>
        ))}
      </div>
    ) : null;
  const derivedLaneContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
              RAG Lane
            </div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
              {selectedItem?.title || "No selection"}
            </div>
          </div>
          {selectionText ? (
            <button
              onClick={() => setSelectionText("")}
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45 transition-colors hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/42">
          Active Highlight
        </div>
        <p className="mt-3 text-sm leading-6 text-white/78">
          {selectionText ||
            "Highlight a passage in the center pane to ask a grounded question."}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setShowPromptInput(true)}
            disabled={!selectionText}
            className="inline-flex items-center gap-2 px-0 py-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-white/80 disabled:opacity-35"
          >
            <SparklesIcon className="h-4 w-4" />
            Ask RAG
          </button>
        </div>

        {showPromptInput ? (
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <textarea
              value={ragPrompt}
              onChange={(event) => setRagPrompt(event.target.value)}
              placeholder="Ask what you want this highlight to answer..."
              className="h-24 w-full resize-none bg-transparent px-0 py-0 text-sm text-white outline-none placeholder:text-white/28"
            />
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setShowPromptInput(false);
                  setRagPrompt("");
                }}
                className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const prompt = trimText(ragPrompt);
                  if (!prompt) return;
                  void runDerivedMode("rag", prompt);
                  setRagPrompt("");
                  setShowPromptInput(false);
                }}
                disabled={!trimText(ragPrompt)}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:text-white/80 disabled:opacity-35"
              >
                Run RAG
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-5 py-5">
        <div className="space-y-0">
          {visiblePanels.length === 0 ? (
            <div className="text-sm text-white/45">
              Derived results for this title will appear here once you run RAG.
            </div>
          ) : (
            visiblePanels.map((panel) => (
              <ReadingWorkspacePanel
                key={panel.id}
                panel={panel}
                onSave={(panelId) => void handleSavePanel(panelId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );

  const workspaceShell = (
    <div className="fixed inset-0 z-[7000] bg-[#050505] text-white">
      <div className="flex h-full min-h-0 w-full">
        <aside className="flex w-[112px] shrink-0 flex-col border-r border-white/8 bg-black/70 px-3 py-8 md:w-[260px] md:px-6">
          <div className="px-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/45">
              Reading
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-none tracking-[-0.06em] text-white md:text-4xl">
              {workspaceTitle}
            </h1>
            {workspaceSubtitle ? (
              <div className="mt-4 text-sm text-white/45">{workspaceSubtitle}</div>
            ) : null}
          </div>

          <div className="mt-8 min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div className="space-y-0">
              {itemState.map((item) => {
                const isSelected = String(item.id) === String(selectedItemId);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(String(item.id));
                      setSelectionText("");
                      setShowPromptInput(false);
                    }}
                    className={`w-full border-b border-white/10 px-1 py-4 text-left transition-colors md:px-2 ${
                      isSelected
                        ? "text-white"
                        : "text-white/55 hover:text-white/82"
                    }`}
                  >
                    <div className="truncate text-xs uppercase tracking-[0.2em] text-white/35">
                      {item.chapter || item.sourceLabel || "Saved Echo"}
                    </div>
                    <div
                      className={`mt-2 text-sm leading-5 md:text-[15px] ${
                        isSelected ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {item.title || "Untitled"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-[#080808] px-4 py-6 md:px-8">
          <div className="mx-auto flex h-full max-w-[1040px] flex-col">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/40">
                  {selectedItem?.chapter || selectedItem?.sourceLabel || "Focused Reading"}
                </div>
                <div className="mt-2 truncate text-2xl font-semibold tracking-[-0.05em] text-white">
                  {selectedItem?.title || workspaceTitle}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedItem?.kind === "note" && selectedItem?.noteId && onSaveNote ? (
                  <button
                    onClick={() => setEditingNoteItemId(String(selectedItem.id))}
                    className="inline-flex h-11 items-center justify-center gap-2 border border-white/10 bg-white/8 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/14"
                    title="Edit note"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit Note
                  </button>
                ) : null}
                {selectedItem?.kind !== "note" && selectedItem?.echoId ? (
                  <>
                    <input
                      ref={echoImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleEchoImageUpload}
                    />
                    <button
                      onClick={() => echoImageInputRef.current?.click()}
                      disabled={isUploadingEchoImage}
                      className="inline-flex h-11 items-center justify-center gap-2 border border-white/10 bg-white/8 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/14 disabled:opacity-45"
                      title="Upload image to saved echo"
                    >
                      {isUploadingEchoImage ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      ) : (
                        <ArrowUpTrayIcon className="h-4 w-4" />
                      )}
                      Add Image
                    </button>
                  </>
                ) : null}
                <button
                  onClick={onClose}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white transition-colors hover:bg-white/14"
                  title="Close reading workspace"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
              {isRichNoteView ? (
                <RichDocumentReader
                  title={selectedItem?.title || ""}
                  subtitle={selectedItem?.chapter || selectedItem?.sourceLabel || ""}
                  html={String(selectedItem?.rawContent || selectedItem?.text || "")}
                  onSelection={(text) => setSelectionText(text)}
                  onReachedEnd={handleReachedEnd}
                  containerClassName="bg-white"
                  paperClassName="bg-white"
                />
              ) : (
                <FocusBlockReader
                  title={selectedItem?.title || ""}
                  subtitle={selectedItem?.chapter || selectedItem?.sourceLabel || ""}
                  text={currentText}
                  topMeta={attachmentGallery}
                  onSelection={(text) => setSelectionText(text)}
                  onReachedEnd={handleReachedEnd}
                  containerClassName="bg-white"
                  paperClassName="bg-white"
                  textClassName="tracking-[-0.01em]"
                />
              )}
            </div>
          </div>
        </main>

        {!isMobile ? (
          <aside className="hidden w-[360px] shrink-0 border-l border-white/8 bg-black/70 xl:flex xl:flex-col">
            {derivedLaneContent}
          </aside>
        ) : null}
      </div>

      {isMobile ? (
        <>
          <div
            className={`absolute inset-y-0 right-0 z-[7100] w-[min(88vw,360px)] border-l border-white/8 bg-black/90 transition-transform duration-200 ${
              isMobileRailOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {derivedLaneContent}
          </div>

          <div className="absolute bottom-5 left-5 right-5 z-[7200] flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              Back
            </button>

            <button
              onClick={() => setIsMobileRailOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 border border-white/10 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
            >
              <SparklesIcon className="h-4 w-4" />
              {isMobileRailOpen ? "Hide RAG" : "Show RAG"}
            </button>
          </div>
        </>
      ) : null}

      {editingNoteItem && editingNoteItem.noteId && onSaveNote ? (
        <NotesFormUI
          groupId={editingNoteItem.groupId || ""}
          initialNote={{
            note_id: editingNoteItem.noteId,
            group_id: editingNoteItem.groupId || "",
            title: editingNoteItem.title || "",
            content:
              editingNoteItem.rawContent ||
              editingNoteItem.fullText ||
              editingNoteItem.text ||
              "",
            tags: editingNoteItem.tags || "",
            linked_echo_id: editingNoteItem.linkedEchoId || "",
          }}
          stacks={noteStacks}
          groups={noteGroups}
          onClose={() => setEditingNoteItemId(null)}
          onSave={async (
            title: string,
            content: string,
            tags: string,
            noteId: string,
            groupId: string,
          ) => {
            await onSaveNote({
              noteId: noteId || editingNoteItem.noteId || "",
              previousGroupId: editingNoteItem.groupId || "",
              groupId: groupId || "",
              title,
              content,
              tags,
            });

            setItemState((prev) =>
              prev.map((item) =>
                String(item.id) === String(editingNoteItem.id)
                  ? {
                      ...item,
                      title,
                      text: content,
                      rawContent: content,
                      groupId: groupId || "",
                      tags,
                    }
                  : item,
              ),
            );
            setEditingNoteItemId(null);
          }}
        />
      ) : null}
    </div>
  );

  if (!portalTarget) {
    return null;
  }

  return createPortal(workspaceShell, portalTarget);
}
