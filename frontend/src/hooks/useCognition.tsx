import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import type { ReaderBook } from "../types/readerBackendTypes";
import type { IngestQueueState } from "../components/libraryManager/libraryManagerTypes";
import { notify } from "../components/system/AppNotifications";
import { useModelRuntime } from "../components/system/ModelRuntimeProvider";

const API = axios.create({ baseURL: "http://127.0.0.1:8000" });
const WS_URL = "ws://127.0.0.1:8000/ws";

const EMPTY_INGEST_QUEUE: IngestQueueState = {
  current: null,
  queued: [],
  counts: {
    active: 0,
    queued: 0,
    total: 0,
  },
  updated_at: null,
};

export default function useCognition() {
  const { ensureRolesThen } = useModelRuntime();
  const [view, setView] = useState("LIBRARY");

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [echoOpen, setEchoOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);

  const [brainBooks, setBrainBooks] = useState([]);
  const [libraryFiles, setLibraryFiles] = useState([]);
  const [ingestQueue, setIngestQueue] = useState<IngestQueueState>(
    EMPTY_INGEST_QUEUE,
  );
  const [currentBook, setCurrentBook] = useState<ReaderBook | null>(null);
  const [bookContent, setBookContent] = useState("");

  // --- ECHO STATE ---
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  // NEW: Add state for recommendations
  const [recommendations, setRecommendations] = useState([]);

  const [triggerVisible, setTriggerVisible] = useState(false);
  const [selectedText, setSelectedText] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const ingesting = ingestQueue.current?.filename || null;

  const applyIngestQueuePayload = useCallback((payload: any) => {
    if (!payload) return;
    setIngestQueue({
      current: payload.current || null,
      queued: Array.isArray(payload.queued) ? payload.queued : [],
      counts: {
        active: payload.counts?.active || 0,
        queued: payload.counts?.queued || 0,
        total: payload.counts?.total || 0,
      },
      updated_at: payload.updated_at || null,
    });
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [l, b, q] = await Promise.all([
        API.get("/library"),
        API.get("/brain/books"),
        API.get("/brain/ingest/status"),
      ]);
      setLibraryFiles(l.data.files || []);
      setBrainBooks(b.data.books || []);
      applyIngestQueuePayload(q.data?.data);
    } catch (err) {
      console.error("Failed to load library data", err);
    }
  }, [applyIngestQueuePayload]);

  useEffect(() => {
    refreshAll();
    socketRef.current = new WebSocket(WS_URL);

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "INGEST_QUEUE_STATE") {
          applyIngestQueuePayload(data.data);
        }
        if (data.status === "complete") {
          refreshAll();
        }
        if (data.type === "INGEST_CANCELLED") {
          applyIngestQueuePayload(data.data);
        }
        if (data.type === "INGEST_ERROR") {
          applyIngestQueuePayload(data.data);
          notify({
            title: "Ingest Failed",
            message: data.job?.error || "The ingest job failed.",
            tone: "error",
          });
          refreshAll();
        }
        if (data.status === "error") {
          console.error("Backend Error: " + data.message);
        }
        if (data.type === "DOWNLOAD_COMPLETE") refreshAll();

        // 🐛 THE FIX: Listen for Maintenance & Vectorize events
        if (data.status === "cleanup_complete") {
          console.log("Cleanup finished!", data.result);
          refreshAll(); // Reload the UI to show the clean filenames!
          notify({
            title: "Library Cleanup",
            message: "Library Cleanup Complete!",
            tone: "success",
          });
        }
        if (data.status === "vectorize_complete") {
          console.log("Vectorization finished!", data.result);
          notify({
            title: "Shadow Index Ready",
            message: "Shadow Index Built! Ghost Recommendations are now active.",
            tone: "success",
          });
        }
      } catch (e) {
        console.error("WS Error:", e);
      }
    };

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [applyIngestQueuePayload, refreshAll]);

  const loadBook = async (filenameOrBook: any) => {
    try {
      const filename =
        typeof filenameOrBook === "string"
          ? filenameOrBook
          : filenameOrBook.filename;

      // 1. EXTRACTION: Safely grab the lid if it exists in the library object
      const libraryId =
        typeof filenameOrBook === "string"
          ? ""
          : filenameOrBook.lid ||
            filenameOrBook.book_id ||
            filenameOrBook.id ||
            "";

      console.log("📖 Loading Book:", filename, "LID:", libraryId);
      const res = await API.get(
        `/reader/books/${encodeURIComponent(filename)}/bootstrap`,
        {
          params: libraryId ? { lid: libraryId } : {},
        },
      );
      const payload = res.data?.data || {};
      const bootstrapBook = payload.book || {};
      const extension =
        bootstrapBook.extension ||
        filename.split(".").pop()?.toLowerCase() ||
        "txt";

      const bookObj: ReaderBook = {
        filename: bootstrapBook.filename || filename,
        title: bootstrapBook.title || filenameOrBook?.title || filename,
        author: bootstrapBook.author || filenameOrBook?.author || "Unknown",
        extension,
        url:
          bootstrapBook.url ||
          `http://127.0.0.1:8000/reader/files/${encodeURIComponent(filename)}`,
        lid: bootstrapBook.lid || libraryId || "",
        file_fingerprint: bootstrapBook.file_fingerprint || "",
        initialReaderBootstrap: payload,
      };

      setCurrentBook(bookObj);
      setBookContent("");
      setView("READER");
    } catch (err) {
      console.error("Load Error:", err);
    }
  };

  // --- ECHO SEARCH LOGIC ---
  const handleSelection = useCallback((textArg?: string) => {
    let text = textArg;
    if (!text) {
      const selection = window.getSelection();
      if (selection) text = selection.toString().trim();
    }
    if (text && text.length > 5) {
      setSelectedText(text);
      setTriggerVisible(true); // Show Bubble, don't search yet
    }
  }, []);

  const dismissTrigger = useCallback(() => {
    setTriggerVisible(false);
    setSelectedText("");
  }, []);

  const searchEchoes = async (textOverride?: string) => {
    const textToSearch = textOverride || selectedText;
    if (!textToSearch) return;

    setQuery(textToSearch);
    setTriggerVisible(false); // Hide Bubble
    setEchoOpen(true); // Open Sidebar
    setLoading(true);
    setResults([]);
    setRecommendations([]);

    try {
      const res = await ensureRolesThen(["embedding", "reasoning"], () =>
        API.post("/echo/context", {
          text: textToSearch,
          limit: 15,
          book_title: currentBook?.title,
          book_author: currentBook?.author,
        }),
      );
      if (!res) return;

      // THE FIX: Properly extract the dictionary and split it into arrays
      const payload = res.data?.data || res.data || {};
      const timelineArray = Array.isArray(payload.timeline)
        ? payload.timeline
        : [];
      const recsArray = Array.isArray(payload.recommendations)
        ? payload.recommendations
        : [];

      console.log("Echo Data successfully wired:", {
        timeline: timelineArray.length,
        recs: recsArray.length,
      });

      setResults(timelineArray);
      setRecommendations(recsArray);
    } catch (err) {
      console.error("Echo Search Failed", err);
      setResults([]);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---
  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await API.post("/ingest", formData);
      refreshAll();
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const ingestFile = async (filename: string) => {
    try {
      const res = await ensureRolesThen(["embedding"], () =>
        API.post("/brain/ingest", { filename }),
      );
      if (!res) return;
      applyIngestQueuePayload(res.data?.queue);
    } catch (err) {
      console.error("Ingest request failed for: " + filename, err);
    }
  };

  const cancelIngest = async (filename: string) => {
    try {
      const res = await API.post("/brain/ingest/cancel", { filename });
      applyIngestQueuePayload(res.data?.data);
    } catch (err) {
      console.error("Cancel ingest failed for: " + filename, err);
      notify({
        title: "Cancel Failed",
        message: `Could not cancel ${filename}.`,
        tone: "error",
      });
    }
  };

  const deleteLibraryFile = async (filename: string) => {
    try {
      await API.delete(`/library/${encodeURIComponent(filename)}`);
      await refreshAll(); // 2. Added await to properly refresh the list
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const deleteBrainBook = async (filename: string) => {
    try {
      await API.delete(`/brain/${encodeURIComponent(filename)}`);
      await refreshAll(); // 3. Added await to properly refresh the list
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return {
    view,
    setView,
    libraryOpen,
    setLibraryOpen,
    echoOpen,
    setEchoOpen,
    loading,
    ingesting,
    ingestQueue,
    libraryFiles,
    brainBooks,
    currentBook,
    bookContent,
    query,
    results,
    recommendations, // Export recommendations!
    notifications,
    loadBook,
    handleSelection,
    searchEchoes,
    triggerVisible,
    selectedText,
    dismissTrigger,
    uploadFile,
    ingestFile,
    cancelIngest,
    deleteLibraryFile,
    deleteBrainBook,
    refreshAll,
  };
}
