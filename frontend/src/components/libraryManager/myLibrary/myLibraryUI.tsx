import React, { useMemo, useState } from "react";
import {
    ArrowPathRoundedSquareIcon,
    ArrowUpTrayIcon,
    BookOpenIcon,
    CpuChipIcon,
    StopIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";
import { confirmAction } from "../../system/AppNotifications";
import CircularProgress from "../../system/CircularProgress";
import type { BrainBook } from "../../../types/libraryBackendTypes";
import type { IngestQueueState } from "../libraryManagerTypes";

interface MyLibraryProps {
    libraryFiles: string[];
    brainBooks: BrainBook[];
    ingesting: string | null;
    ingestQueue?: IngestQueueState;
    onUpload: (file: File) => Promise<void>;
    onIngest: (filename: string) => Promise<void>;
    onCancelIngest: (filename: string) => Promise<void>;
    onDelete: (filename: string, bulk?: boolean) => Promise<void>;
    onRead: (filename: string) => void;
}

const normalizeFileKey = (value: string) =>
    value
        .toLowerCase()
        .replace(/\.[^/.]+$/, "")
        .replace(/[\s_-]+/g, "");

export default function MyLibrary({
    libraryFiles,
    brainBooks,
    ingesting,
    ingestQueue,
    onUpload,
    onIngest,
    onCancelIngest,
    onDelete,
    onRead,
}: MyLibraryProps) {
    const [dragActive, setDragActive] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [cleaning, setCleaning] = useState(false);
    const [cleanMsg, setCleanMsg] = useState("");

    const filteredFiles = libraryFiles.filter((file) =>
        file.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const brainKeys = useMemo(
        () =>
            new Set(
                brainBooks.flatMap((book) =>
                    [book.filename, book.title, book.original_name]
                        .filter(Boolean)
                        .map((value) => normalizeFileKey(String(value))),
                ),
            ),
        [brainBooks],
    );

    const queuedFilenames = useMemo(
        () =>
            new Set(
                (ingestQueue?.queued || [])
                    .map((job) => job.filename)
                    .filter(Boolean),
            ),
        [ingestQueue],
    );

    const toggleSelection = (filename: string) => {
        const newSelection = new Set(selectedFiles);
        if (newSelection.has(filename)) {
            newSelection.delete(filename);
        } else {
            newSelection.add(filename);
        }
        setSelectedFiles(newSelection);
    };

    const toggleSelectAll = () => {
        if (
            selectedFiles.size === filteredFiles.length &&
            filteredFiles.length > 0
        ) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(filteredFiles));
        }
    };

    const handleBulkDelete = async () => {
        const confirmed = await confirmAction({
            title: "Delete Files",
            message: `Are you sure you want to delete ${selectedFiles.size} files?`,
            tone: "error",
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
        });
        if (!confirmed) return;

        for (const file of selectedFiles) {
            await onDelete(file, true);
        }
        setSelectedFiles(new Set());
    };

    const handleBulkIngest = async () => {
        for (const file of selectedFiles) {
            await onIngest(file);
        }
        setSelectedFiles(new Set());
    };

    const handleCleanLibrary = async () => {
        setCleaning(true);

        try {
            const API = axios.create({
                baseURL: "https://doomprompting123-space.hf.space",
            });

            setCleanMsg("Registering Local Files...");
            await API.post("/library/clean_local");

            await new Promise((resolve) => setTimeout(resolve, 1000));

            setCleanMsg("Hydrating Metadata API...");
            const res = await API.post("/library/hydrate_api");

            if (res.data.status === "started") {
                setCleanMsg("Task started. Processing in background...");
                setTimeout(() => {
                    setCleanMsg("");
                    setCleaning(false);
                }, 4000);
            }
        } catch (e) {
            console.error("Hydration Failed:", e);
            setCleanMsg("Hydration Failed.");
            setCleaning(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover")
            setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onUpload(e.target.files[0]);
        }
    };

    return (
        <div className="space-y-6 font-sans">
            <div
                className={`border border-dashed rounded-sm p-8 text-center transition-colors ${
                    dragActive
                        ? "border-slate-500 bg-slate-100"
                        : "border-slate-300 bg-canvas hover:border-slate-400 hover:bg-slate-100/50"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-surface border border-border-subtle text-slate-600 rounded-sm shadow-sm">
                        <ArrowUpTrayIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-primary uppercase tracking-wide">
                            Ingest Document Hub
                        </p>
                        <p className="text-[10px] font-mono text-muted mt-1 uppercase tracking-widest">
                            Supports PDF, EPUB, TXT, MD
                        </p>
                    </div>
                    <label className="mt-3 px-6 py-2 bg-slate-800 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 cursor-pointer shadow-sm transition-all">
                        Browse Local System
                        <input
                            type="file"
                            className="hidden"
                            onChange={handleFileInput}
                            accept=".pdf,.epub,.txt,.md"
                        />
                    </label>
                </div>
            </div>

            <div className="bg-surface rounded-sm shadow-sm border border-border-subtle overflow-hidden">
                <div className="p-4 border-b border-border-subtle bg-canvas flex justify-between items-center flex-wrap gap-4 min-h-[60px]">
                    <div className="flex items-center gap-4">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded-sm border-slate-300 text-primary focus:ring-slate-500 cursor-pointer"
                            checked={
                                filteredFiles.length > 0 &&
                                selectedFiles.size === filteredFiles.length
                            }
                            onChange={toggleSelectAll}
                        />

                        {selectedFiles.size > 0 ? (
                            <div className="flex items-center gap-3 animate-in fade-in">
                                <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                                    {selectedFiles.size} Selected
                                </span>
                                <div className="h-4 w-px bg-slate-300 mx-1"></div>
                                <button
                                    onClick={handleBulkIngest}
                                    className="text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 bg-slate-800 text-white rounded-sm hover:bg-slate-900 transition-colors flex items-center gap-1"
                                >
                                    <CpuChipIcon className="w-3 h-3" /> Add to
                                    Brain
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 bg-surface border border-border-subtle text-red-600 rounded-sm hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1"
                                >
                                    <TrashIcon className="w-3 h-3" /> Delete
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <h2 className="text-[10px] uppercase tracking-widest font-bold text-primary flex items-center gap-2">
                                    <span className="w-2 h-2 bg-slate-800 rounded-sm"></span>
                                    Local Registry ({libraryFiles.length})
                                </h2>

                                {ingestQueue &&
                                    ingestQueue.counts.total > 0 && (
                                        <>
                                            <div className="h-4 w-px bg-slate-300"></div>
                                            <span className="text-[9px] font-mono font-bold text-slate-600 uppercase tracking-widest bg-slate-100 border border-border-subtle px-2 py-0.5 rounded-sm">
                                                Queue {ingestQueue.counts.total}
                                            </span>
                                        </>
                                    )}

                                <div className="h-4 w-px bg-slate-300"></div>

                                <button
                                    onClick={handleCleanLibrary}
                                    disabled={cleaning}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[9px] uppercase tracking-widest font-bold bg-surface border border-border-subtle hover:bg-canvas transition-colors text-slate-600 disabled:opacity-50"
                                >
                                    <ArrowPathRoundedSquareIcon
                                        className={`w-3 h-3 ${cleaning ? "animate-spin" : ""}`}
                                    />
                                    {cleaning
                                        ? "Cleaning..."
                                        : "Clean Metadata"}
                                </button>
                                {cleanMsg && (
                                    <span className="text-[9px] font-mono font-bold text-slate-600 animate-pulse bg-slate-100 border border-border-subtle px-2 py-0.5 rounded-sm uppercase">
                                        {cleanMsg}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filter registry..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 pr-4 py-1.5 text-xs bg-surface border border-border-subtle rounded-sm focus:border-slate-400 focus:ring-0 outline-none w-64 text-slate-700 font-mono placeholder:text-muted"
                        />
                        <svg
                            className="w-4 h-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                    </div>
                </div>

                <div className="divide-y divide-slate-100">
                    {filteredFiles.length === 0 ? (
                        <div className="p-8 text-center text-muted text-[10px] font-mono uppercase tracking-widest">
                            {libraryFiles.length === 0
                                ? "Registry is empty. Ingest documents to begin."
                                : "No matching nodes found."}
                        </div>
                    ) : (
                        filteredFiles.map((filename) => {
                            const isSelected = selectedFiles.has(filename);
                            const normalizedFilename =
                                normalizeFileKey(filename);
                            const isInBrain = brainKeys.has(normalizedFilename);
                            const isQueued = queuedFilenames.has(filename);
                            const isIngesting = ingesting === filename;
                            const currentJob =
                                ingestQueue?.current?.filename === filename
                                    ? ingestQueue.current
                                    : null;
                            const ingestProgress = currentJob?.progress || 0;
                            const isCancelling = Boolean(
                                currentJob?.cancel_requested,
                            );
                            const statusBits = [
                                "Local File",
                                isInBrain ? "In Brain" : null,
                                isCancelling
                                    ? "Cancelling"
                                    : isIngesting
                                      ? "Ingesting"
                                      : null,
                                !isIngesting && isQueued ? "Queued" : null,
                            ].filter(Boolean);

                            return (
                                <div
                                    key={filename}
                                    onClick={() => toggleSelection(filename)}
                                    className={`p-4 flex items-center justify-between transition-colors group cursor-pointer ${
                                        isSelected
                                            ? "bg-canvas"
                                            : "hover:bg-canvas/50"
                                    }`}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded-sm border-slate-300 text-primary focus:ring-slate-500 cursor-pointer"
                                            checked={isSelected}
                                            onChange={() =>
                                                toggleSelection(filename)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="w-10 h-10 bg-surface border border-border-subtle rounded-sm flex items-center justify-center text-muted font-mono font-bold text-[9px] uppercase flex-shrink-0 shadow-sm">
                                            {filename.split(".").pop()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-primary truncate font-sans">
                                                {filename}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <p className="text-[9px] font-mono text-muted uppercase tracking-widest">
                                                    {statusBits.join(" | ")}
                                                </p>
                                                {isInBrain && (
                                                    <span className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-700">
                                                        In Brain
                                                    </span>
                                                )}
                                                {!isIngesting && isQueued && (
                                                    <span className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-amber-200 bg-amber-50 text-amber-700">
                                                        Queued
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        className="flex items-center gap-3"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {isIngesting || isQueued ? (
                                            <>
                                                {isIngesting ? (
                                                    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 border border-border-subtle rounded-sm">
                                                        <CircularProgress
                                                            value={
                                                                ingestProgress
                                                            }
                                                            size={34}
                                                            strokeWidth={4}
                                                            className="shrink-0"
                                                            progressClassName={
                                                                isCancelling
                                                                    ? "stroke-red-500"
                                                                    : "stroke-slate-700"
                                                            }
                                                            textClassName={
                                                                isCancelling
                                                                    ? "fill-red-600"
                                                                    : "fill-slate-700"
                                                            }
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="text-[9px] uppercase tracking-widest font-bold text-slate-700">
                                                                {isCancelling
                                                                    ? "Cancelling..."
                                                                    : "Vectorizing"}
                                                            </div>
                                                            <div className="text-[8px] font-mono uppercase tracking-widest text-slate-500">
                                                                {currentJob?.phase ||
                                                                    "working"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="flex items-center gap-2 px-3 py-1.5 border text-[9px] uppercase tracking-widest font-bold rounded-sm bg-amber-50 border-amber-200 text-amber-700">
                                                        <CpuChipIcon className="w-3 h-3" />
                                                        Queued
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() =>
                                                        onCancelIngest(filename)
                                                    }
                                                    className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 rounded-sm transition-colors flex items-center gap-1"
                                                >
                                                    <StopIcon className="w-3 h-3" />{" "}
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() =>
                                                        onRead(filename)
                                                    }
                                                    className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold text-slate-600 hover:text-primary border border-transparent hover:border-border-subtle hover:bg-surface rounded-sm transition-colors flex items-center gap-1"
                                                >
                                                    <BookOpenIcon className="w-3 h-3" />{" "}
                                                    Read
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        onIngest(filename)
                                                    }
                                                    className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold bg-surface border border-border-subtle text-slate-700 hover:bg-canvas hover:text-primary rounded-sm transition-colors flex items-center gap-1 shadow-sm"
                                                >
                                                    <CpuChipIcon className="w-3 h-3" />{" "}
                                                    Add to Brain
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        onDelete(filename)
                                                    }
                                                    className="p-1.5 text-muted hover:text-red-600 hover:bg-red-50 rounded-sm transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
