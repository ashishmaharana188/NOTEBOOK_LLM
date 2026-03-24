import React, { useEffect, useRef, useState } from "react";
import useDiscover from "../../../hooks/libraryManager/useDiscover";
import {
    MagnifyingGlassIcon,
    ArrowDownTrayIcon,
    BookOpenIcon,
    SparklesIcon,
    FunnelIcon,
    ArrowPathIcon,
    CpuChipIcon,
    StopIcon,
} from "@heroicons/react/24/outline";
import type { DiscoverProps } from "../libraryManagerTypes";
import axios from "axios";
import { useModelRuntime } from "../../system/ModelRuntimeProvider";
import CircularProgress from "../../system/CircularProgress";

const WS_URL = "ws://127.0.0.1:8000/ws";

export default function Discover({ onStartDownload }: DiscoverProps) {
    const { ensureRolesThen } = useModelRuntime();
    const {
        searchSource,
        setSearchSource,
        filteredResults,
        loading,
        searchMessage,
        simpleQuery,
        setSimpleQuery,
        filter,
        setFilter,
        facets,
        activeFacet,
        toggleFacet,
        limit,
        setLimit,
        selectedGenre,
        setSelectedGenre,
        handleCuratorSearch,
        handleSync,
        syncing,
        handleSearch,
        selectedDiscover,
        toggleDiscover,
        toggleAllDiscover,
        downloadFormat,
        setDownloadFormat,
        handleDownload,
        handleDirectIngest,
        handleBulkDownload,
        handleBulkIngest,
        handleSyncCSV,
        syncingCSV,
        handleCleanLocal,
        cleaningLocal,
        handleHydrateAPI,
        hydratingAPI,
    } = useDiscover();

    const [mode, setMode] = useState<"SEARCH" | "CURATOR">("SEARCH");
    const [curatorTopic, setCuratorTopic] = useState("");
    const [vectorizing, setVectorizing] = useState(false);
    const [vectorizeMsg, setVectorizeMsg] = useState("");
    const [vectorizeProgress, setVectorizeProgress] = useState(0);
    const socketRef = useRef<WebSocket | null>(null);
    const vectorizingRef = useRef(false);

    useEffect(() => {
        vectorizingRef.current = vectorizing;
    }, [vectorizing]);

    useEffect(() => {
        socketRef.current = new WebSocket(WS_URL);
        socketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "VECTORIZE_PROGRESS") {
                    const payload = data.data || {};
                    setVectorizing(true);
                    setVectorizeProgress(payload.percent || 0);
                    setVectorizeMsg(
                        payload.phase === "complete"
                            ? "Shadow Index Ready"
                            : `Building Shadow Index: ${payload.phase || "vectorizing"}`,
                    );
                }
                if (data.status === "vectorize_complete") {
                    const result = data.result || {};
                    if (result.status === "stopped") {
                        setVectorizeMsg("Vectorization stopped.");
                        setVectorizeProgress(0);
                    } else if (result.status === "busy") {
                        setVectorizeMsg("Vectorization already running.");
                    } else {
                        setVectorizeProgress(100);
                        setVectorizeMsg("Shadow Index Ready");
                    }
                    setVectorizing(false);
                }
                if (data.status === "error" && vectorizingRef.current) {
                    setVectorizeMsg("Vectorization failed.");
                    setVectorizeProgress(0);
                    setVectorizing(false);
                }
            } catch (error) {
                console.error("Vectorization WS parse failed", error);
            }
        };

        return () => {
            if (socketRef.current) socketRef.current.close();
        };
    }, []);

    const triggerDownload = (book: any, format: string) => {
        onStartDownload(book);
        handleDownload(book, format);
    };

    const triggerBulkDownload = async () => {
        const selectedBooks = filteredResults.filter((b) =>
            selectedDiscover.has(b.id),
        );
        selectedBooks.forEach((b) => onStartDownload(b));
        handleBulkDownload();
    };

    const handleVectorize = async () => {
        console.log("🚀 handleVectorize fired! Sending request to backend...");
        const API = axios.create({
            baseURL: "https://doomprompting123-space.hf.space",
        });

        if (vectorizing) {
            try {
                await API.post("/recommender/vectorize/stop");
                setVectorizeMsg("🛑 Stopping Vectorization...");
                setVectorizeMsg("Stopping Vectorization...");
            } catch (e) {
                console.error("❌ Stop Failed:", e);
            }
            return;
        }

        setVectorizing(true);
        setVectorizeProgress(0);
        setVectorizeMsg("🧠 Building Shadow Index...");

        try {
            const res = await ensureRolesThen(["embedding"], () =>
                API.post("/recommender/vectorize"),
            );
            if (!res) {
                setVectorizing(false);
                setVectorizeMsg("");
                setVectorizeProgress(0);
                return;
            }
            if (res.data.status === "started") {
                setVectorizeMsg(
                    "✅ Task started in background! You can keep reading.",
                );
            }
        } catch (e) {
            console.error("❌ Vectorization Failed:", e);
            setVectorizeMsg("❌ Vectorization Failed.");
            setVectorizeProgress(0);
            setVectorizing(false);
        }
    };

    return (
        <div className="space-y-6 font-sans">
            {/* --- HEADER & CONTROLS --- */}
            <div className="bg-surface p-6 rounded-sm shadow-sm border border-border-subtle">
                {/* TOP ROW: Mode Switcher & Admin Controls */}
                <div className="flex flex-wrap items-center justify-between mb-6 pb-6 border-b border-slate-100 gap-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode("SEARCH")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-sm text-[10px] uppercase tracking-widest font-bold transition-all ${
                                mode === "SEARCH"
                                    ? "bg-slate-800 text-white shadow-sm"
                                    : "bg-surface border border-border-subtle text-muted hover:bg-canvas hover:text-primary"
                            }`}
                        >
                            <MagnifyingGlassIcon className="w-3.5 h-3.5" />{" "}
                            Manual Query
                        </button>
                        <button
                            onClick={() => setMode("CURATOR")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-sm text-[10px] uppercase tracking-widest font-bold transition-all ${
                                mode === "CURATOR"
                                    ? "bg-slate-800 text-white shadow-sm"
                                    : "bg-surface border border-border-subtle text-muted hover:bg-canvas hover:text-primary"
                            }`}
                        >
                            <SparklesIcon className="w-3.5 h-3.5" /> The Curator
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {(vectorizing || vectorizeProgress > 0) && (
                            <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-canvas border border-border-subtle">
                                <CircularProgress
                                    value={vectorizeProgress}
                                    size={40}
                                    strokeWidth={4}
                                    progressClassName="stroke-slate-800"
                                    trackClassName="stroke-slate-200"
                                    textClassName="fill-slate-800"
                                />
                                <div className="min-w-0">
                                    <div className="text-[9px] uppercase tracking-widest font-bold text-slate-700">
                                        Shadow Index
                                    </div>
                                    <div className="text-[8px] font-mono uppercase tracking-widest text-slate-500">
                                        {vectorizing
                                            ? "Vectorizing"
                                            : "Last Run"}
                                    </div>
                                </div>
                            </div>
                        )}
                        {vectorizeMsg && (
                            <span className="text-[9px] font-mono font-bold text-slate-600 animate-pulse bg-canvas px-2 py-1 rounded-sm border border-border-subtle uppercase">
                                {vectorizeMsg}
                            </span>
                        )}

                        <button
                            onClick={handleSyncCSV}
                            disabled={syncingCSV || vectorizing}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-surface hover:bg-canvas text-slate-700 transition-colors border border-border-subtle disabled:opacity-50"
                        >
                            <ArrowPathIcon
                                className={`w-3 h-3 ${syncingCSV ? "animate-spin" : ""}`}
                            />
                            {syncingCSV ? "Syncing..." : "Sync CSVs"}
                        </button>

                        <button
                            onClick={handleCleanLocal}
                            disabled={cleaningLocal || vectorizing}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-surface hover:bg-canvas text-slate-700 transition-colors border border-border-subtle disabled:opacity-50"
                        >
                            <ArrowPathIcon
                                className={`w-3 h-3 ${cleaningLocal ? "animate-spin" : ""}`}
                            />
                            {cleaningLocal ? "Cleaning..." : "Clean Local"}
                        </button>

                        <button
                            onClick={handleHydrateAPI}
                            disabled={hydratingAPI || vectorizing}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-surface hover:bg-canvas text-slate-700 transition-colors border border-border-subtle disabled:opacity-50"
                        >
                            <ArrowPathIcon
                                className={`w-3 h-3 ${hydratingAPI ? "animate-spin" : ""}`}
                            />
                            {hydratingAPI ? "Fetching..." : "Fetch API"}
                        </button>

                        <button
                            onClick={handleVectorize}
                            disabled={syncing}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold transition-all shadow-sm ${
                                vectorizing
                                    ? "bg-surface border border-red-300 text-red-600 hover:bg-red-50"
                                    : "bg-slate-800 text-white border border-slate-800 hover:bg-slate-900"
                            }`}
                        >
                            {vectorizing ? (
                                <>
                                    <StopIcon className="w-3 h-3 animate-pulse" />{" "}
                                    Stop Build
                                </>
                            ) : (
                                <>
                                    <CpuChipIcon className="w-3 h-3" /> Build
                                    Index
                                </>
                            )}
                        </button>

                        <div className="flex items-center gap-2 pl-4 border-l border-border-subtle ml-1">
                            <span className="text-[9px] font-bold text-muted uppercase tracking-widest">
                                Cap:
                            </span>
                            <select
                                className="bg-surface border border-border-subtle text-slate-700 text-[10px] font-mono font-bold rounded-sm px-2 py-1 outline-none focus:border-slate-400"
                                value={limit}
                                onChange={(e) =>
                                    setLimit(Number(e.target.value))
                                }
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* --- MODE SPECIFIC CONTROLS --- */}
                <div className="flex flex-wrap gap-4 items-end">
                    {mode === "SEARCH" ? (
                        <>
                            <div className="flex bg-slate-100 p-0.5 rounded-sm border border-border-subtle">
                                <button
                                    onClick={() =>
                                        setSearchSource("InternetArchive")
                                    }
                                    className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        searchSource === "InternetArchive"
                                            ? "bg-surface shadow-sm text-primary"
                                            : "text-muted hover:text-slate-700"
                                    }`}
                                >
                                    Internet Archive
                                </button>
                                <button
                                    onClick={() => setSearchSource("Gutenberg")}
                                    className={`px-3 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        searchSource === "Gutenberg"
                                            ? "bg-surface shadow-sm text-primary"
                                            : "text-muted hover:text-slate-700"
                                    }`}
                                >
                                    Gutenberg
                                </button>
                            </div>

                            {searchSource === "Gutenberg" && (
                                <div className="w-32">
                                    <label className="block text-[9px] font-bold text-muted uppercase tracking-widest mb-1">
                                        Filter By
                                    </label>
                                    <select
                                        className="w-full border border-border-subtle rounded-sm px-3 py-2 text-xs bg-surface outline-none focus:border-slate-400 text-slate-700 font-mono"
                                        value={filter}
                                        onChange={(e) =>
                                            setFilter(e.target.value)
                                        }
                                    >
                                        <option value="title">Title</option>
                                        <option value="author">Author</option>
                                        <option value="subject">Subject</option>
                                    </select>
                                </div>
                            )}

                            <div className="flex-1 relative min-w-[250px]">
                                <label className="block text-[9px] font-bold text-muted uppercase tracking-widest mb-1">
                                    Query String
                                </label>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                    <input
                                        className="w-full pl-9 pr-4 py-2 border border-border-subtle rounded-sm text-xs font-mono focus:border-slate-400 outline-none placeholder:text-slate-300"
                                        placeholder={
                                            searchSource === "Gutenberg"
                                                ? "Search literature corpus..."
                                                : "Search archive registry..."
                                        }
                                        value={simpleQuery}
                                        onChange={(e) =>
                                            setSimpleQuery(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" &&
                                            handleSearch(undefined)
                                        }
                                    />
                                </div>
                            </div>

                            <div className="pb-0.5">
                                <button
                                    onClick={() => handleSearch(undefined)}
                                    disabled={loading}
                                    className="h-[34px] px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-sm font-bold text-[10px] uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {loading ? "Scanning..." : "Search"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-48">
                                <label className="block text-[9px] font-bold text-muted uppercase tracking-widest mb-1">
                                    Taxonomy Filter
                                </label>
                                <select
                                    className="w-full border border-border-subtle rounded-sm px-3 py-2 text-xs bg-surface outline-none focus:border-slate-400 text-primary font-bold"
                                    value={selectedGenre}
                                    onChange={(e) =>
                                        setSelectedGenre(e.target.value)
                                    }
                                >
                                    <option value="All">Global Scope</option>
                                    <option value="Philosophy">
                                        Philosophy
                                    </option>
                                    <option value="History">History</option>
                                    <option value="Science">Science</option>
                                    <option value="Fiction">Fiction</option>
                                    <option value="Psychology">
                                        Psychology
                                    </option>
                                    <option value="Politics">Politics</option>
                                    <option value="Art">Art</option>
                                    <option value="Technology">
                                        Technology
                                    </option>
                                </select>
                            </div>

                            <div className="flex-1 relative min-w-[200px]">
                                <label className="block text-[9px] font-bold text-muted uppercase tracking-widest mb-1">
                                    Semantic Vector (Optional)
                                </label>
                                <div className="relative">
                                    <SparklesIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                    <input
                                        className="w-full pl-9 pr-4 py-2 border border-border-subtle rounded-sm text-xs font-mono focus:border-slate-400 outline-none bg-surface placeholder:text-slate-300"
                                        placeholder="e.g. 'Bronze Age' (Empty = Registry Context)"
                                        value={curatorTopic}
                                        onChange={(e) =>
                                            setCuratorTopic(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === "Enter" &&
                                            handleCuratorSearch(curatorTopic)
                                        }
                                    />
                                </div>
                            </div>

                            <div className="pb-0.5">
                                <button
                                    onClick={() =>
                                        handleCuratorSearch(curatorTopic)
                                    }
                                    disabled={loading}
                                    className="h-[34px] flex items-center gap-2 px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-sm font-bold text-[10px] uppercase tracking-widest transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {loading ? "Curating..." : "Recommend"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- RESULTS AREA --- */}
            <div className="bg-surface rounded-sm shadow-sm border border-border-subtle overflow-hidden">
                {/* Bulk Actions Bar */}
                <div className="p-4 border-b border-border-subtle flex flex-wrap gap-4 justify-between items-center bg-canvas">
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded-sm border-slate-300 text-primary focus:ring-slate-500 cursor-pointer"
                            checked={
                                filteredResults.length > 0 &&
                                selectedDiscover.size === filteredResults.length
                            }
                            onChange={toggleAllDiscover}
                        />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-600">
                            {filteredResults.length} Nodes{" "}
                            {selectedDiscover.size > 0 &&
                                `(${selectedDiscover.size} Selected)`}
                        </span>
                    </div>

                    <div className="flex gap-2 items-center">
                        <select
                            value={downloadFormat}
                            onChange={(e) => setDownloadFormat(e.target.value)}
                            className="px-3 py-1.5 rounded-sm text-[10px] font-mono font-bold bg-surface border border-border-subtle text-slate-700 outline-none"
                        >
                            <option value="epub">EPUB</option>
                            <option value="pdf">PDF</option>
                            <option value="txt">TXT</option>
                        </select>
                        <button
                            onClick={triggerBulkDownload}
                            disabled={selectedDiscover.size === 0}
                            className="px-4 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-surface border border-border-subtle hover:bg-canvas text-slate-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            Fetch All
                        </button>
                        <button
                            onClick={handleBulkIngest}
                            disabled={selectedDiscover.size === 0}
                            className="px-4 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            Ingest All
                        </button>
                    </div>
                </div>

                {/* --- FACETS FILTER (CLIENT-SIDE) --- */}
                {mode === "SEARCH" && facets.length > 0 && (
                    <div className="px-6 pt-4 flex flex-wrap gap-2 items-center">
                        <span className="text-[9px] font-bold text-muted uppercase tracking-widest mr-2 flex items-center">
                            <FunnelIcon className="w-3 h-3 mr-1" /> Refine:
                        </span>
                        {facets.map((f, i) => {
                            const isActive = activeFacet === f.name;
                            return (
                                <button
                                    key={i}
                                    onClick={() => toggleFacet(f.name)}
                                    className={`px-3 py-1 rounded-sm text-[10px] font-mono font-bold uppercase transition-colors shadow-sm border ${
                                        isActive
                                            ? "bg-slate-800 text-white border-slate-800"
                                            : "bg-surface border-border-subtle text-slate-600 hover:border-slate-400"
                                    }`}
                                >
                                    {f.name}{" "}
                                    <span
                                        className={`ml-1 ${isActive ? "text-muted" : "text-muted"}`}
                                    >
                                        [{f.count}]
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Messages */}
                {searchMessage && (
                    <div className="bg-canvas p-3 text-center border border-border-subtle mt-4 mx-6 rounded-sm">
                        <p className="text-[10px] text-slate-600 font-mono font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                            {mode === "CURATOR" && (
                                <SparklesIcon className="w-3 h-3" />
                            )}{" "}
                            {searchMessage}
                        </p>
                    </div>
                )}

                {/* Grid */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredResults.map((book) => (
                        <div
                            key={book.id}
                            onClick={() => toggleDiscover(book.id)}
                            className={`group bg-surface border rounded-sm overflow-hidden transition-all duration-200 flex flex-col h-full relative cursor-pointer ${
                                selectedDiscover.has(book.id)
                                    ? "border-slate-800 shadow-md"
                                    : "border-border-subtle hover:border-slate-400 shadow-sm"
                            }`}
                        >
                            <div
                                className="absolute top-2 left-2 z-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedDiscover.has(book.id)}
                                    onChange={() => toggleDiscover(book.id)}
                                    className="w-4 h-4 rounded-sm cursor-pointer border-slate-300 text-primary focus:ring-slate-500 shadow-sm"
                                />
                            </div>

                            <div className="p-4 flex gap-4 flex-1 mt-6">
                                <div className="w-20 h-28 shrink-0 bg-canvas border border-border-subtle rounded-sm overflow-hidden relative shadow-sm flex items-center justify-center">
                                    {book.cover ? (
                                        <img
                                            src={book.cover}
                                            className="w-full h-full object-cover grayscale opacity-90 group-hover:grayscale-0 transition-all"
                                            alt="cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1">
                                            <BookOpenIcon className="w-6 h-6" />
                                            <span className="text-[8px] font-bold font-mono tracking-widest">
                                                NO DATA
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col">
                                    <h3 className="font-bold text-primary text-sm line-clamp-2 mb-1 leading-snug">
                                        {book.title}
                                    </h3>
                                    <p className="text-[10px] font-mono text-muted mb-2 truncate uppercase">
                                        {book.author || "Unknown"} •{" "}
                                        {book.year || "N/A"}
                                    </p>

                                    <span className="text-[9px] px-1.5 py-0.5 rounded-sm border w-fit font-bold uppercase tracking-widest bg-canvas text-slate-600 border-border-subtle">
                                        {book.source}
                                    </span>

                                    {book.recommendation_reason && (
                                        <div className="mt-3 flex items-start gap-1 bg-canvas p-2 rounded-sm border border-slate-100">
                                            <SparklesIcon className="w-3 h-3 text-muted shrink-0 mt-0.5" />
                                            <p className="text-[9px] text-slate-600 italic leading-relaxed line-clamp-3">
                                                "{book.recommendation_reason}"
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div
                                className="p-3 border-t border-slate-100 bg-canvas flex gap-2"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() =>
                                        triggerDownload(book, downloadFormat)
                                    }
                                    className="flex-1 py-1.5 bg-surface border border-border-subtle hover:bg-slate-100 text-slate-700 text-[9px] uppercase tracking-widest font-bold rounded-sm transition-colors flex justify-center items-center gap-1 shadow-sm"
                                >
                                    <ArrowDownTrayIcon className="w-3 h-3" />{" "}
                                    Fetch
                                </button>
                                <button
                                    onClick={() =>
                                        handleDirectIngest(book, downloadFormat)
                                    }
                                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[9px] uppercase tracking-widest font-bold rounded-sm transition-colors shadow-sm flex justify-center items-center gap-1"
                                >
                                    <CpuChipIcon className="w-3 h-3" /> Ingest
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
