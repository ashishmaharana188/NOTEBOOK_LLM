import React, { useState } from "react";
import {
  TrashIcon,
  BookOpenIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";
import type { ReaderBook } from "../../../types/readerBackendTypes";
import { confirmAction } from "../../system/AppNotifications";

interface TheBrainProps {
  brainBooks: ReaderBook[];
  onDelete: (filename: string, bulk?: boolean) => Promise<void>;
  onRead?: (filename: string) => void;
}

export default function TheBrain({
  brainBooks,
  onDelete,
  onRead,
}: TheBrainProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());

  const filteredBooks = brainBooks.filter((book) => {
    const term = searchTerm.toLowerCase();
    return (
      (book.title || "").toLowerCase().includes(term) ||
      (book.author || "").toLowerCase().includes(term)
    );
  });

  const toggleSelection = (filename: string) => {
    const newSelection = new Set(selectedBooks);
    if (newSelection.has(filename)) {
      newSelection.delete(filename);
    } else {
      newSelection.add(filename);
    }
    setSelectedBooks(newSelection);
  };

  const toggleSelectAll = () => {
    if (
      selectedBooks.size === filteredBooks.length &&
      filteredBooks.length > 0
    ) {
      setSelectedBooks(new Set());
    } else {
      const allFilenames = filteredBooks.map((b) => b.filename);
      setSelectedBooks(new Set(allFilenames));
    }
  };

  const handleBulkForget = async () => {
    const confirmed = await confirmAction({
      title: "Forget Networks",
      message: `Are you sure you want to forget ${selectedBooks.size} mapped networks?`,
      tone: "warning",
      confirmLabel: "Forget",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    for (const file of selectedBooks) {
      await onDelete(file, true);
    }
    setSelectedBooks(new Set());
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. HEADER / ACTIONS BAR */}
      <div className="bg-surface rounded-sm shadow-sm border border-border-subtle overflow-hidden">
        <div className="p-4 border-b border-border-subtle bg-canvas flex justify-between items-center flex-wrap gap-4 min-h-[60px]">
          <div className="flex items-center gap-4">
            {/* SELECT ALL CHECKBOX */}
            <input
              type="checkbox"
              className="w-4 h-4 rounded-sm border-slate-300 text-primary focus:ring-slate-500 cursor-pointer"
              checked={
                filteredBooks.length > 0 &&
                selectedBooks.size === filteredBooks.length
              }
              onChange={toggleSelectAll}
            />

            {selectedBooks.size > 0 ? (
              <div className="flex items-center gap-3 animate-in fade-in">
                <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                  {selectedBooks.size} Selected
                </span>
                <div className="h-4 w-px bg-slate-300 mx-1"></div>
                <button
                  onClick={handleBulkForget}
                  className="text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 bg-surface border border-border-subtle text-red-600 rounded-sm hover:bg-red-50 hover:border-red-200 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <TrashIcon className="w-3 h-3" />
                  Purge Networks
                </button>
              </div>
            ) : (
              <h2 className="text-[10px] uppercase tracking-widest font-bold text-primary flex items-center gap-2">
                <span className="w-2 h-2 bg-slate-800 rounded-sm"></span>
                Ingested Networks ({brainBooks.length})
              </h2>
            )}
          </div>

          {/* SEARCH INPUT */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter networks..."
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

        {/* 2. BOOK LIST */}
        <div className="divide-y divide-slate-100">
          {filteredBooks.length === 0 ? (
            <div className="p-8 text-center text-muted text-[10px] font-mono uppercase tracking-widest">
              {brainBooks.length === 0
                ? "Neural network is empty. Ingest books from the Library."
                : "No matching networks found."}
            </div>
          ) : (
            filteredBooks.map((book, idx) => {
              const isSelected = selectedBooks.has(book.filename);
              return (
                <div
                  key={book.filename || idx}
                  onClick={() => toggleSelection(book.filename)}
                  className={`p-4 flex items-center justify-between transition-colors group cursor-pointer ${
                    isSelected ? "bg-canvas" : "hover:bg-canvas/50"
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded-sm border-slate-300 text-primary focus:ring-slate-500 cursor-pointer"
                      checked={isSelected}
                      onChange={() => toggleSelection(book.filename)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Minimalist Icon */}
                    <div className="w-10 h-10 bg-surface border border-border-subtle rounded-sm flex items-center justify-center text-primary flex-shrink-0 shadow-sm">
                      <CpuChipIcon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-primary truncate">
                        {book.title || book.filename}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-mono text-muted uppercase tracking-widest truncate max-w-[200px]">
                          {book.author || "Unknown Author"}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="uppercase text-[9px] font-mono font-bold tracking-widest border border-border-subtle bg-canvas px-1.5 py-0.5 rounded-sm text-muted">
                          {book.source_type || "Local Vector"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onRead && (
                      <button
                        onClick={() => onRead(book.filename)}
                        className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold text-slate-600 hover:text-primary border border-transparent hover:border-border-subtle hover:bg-surface rounded-sm transition-colors flex items-center gap-1"
                      >
                        <BookOpenIcon className="w-3 h-3" /> Read
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(book.filename)}
                      className="px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold text-red-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-sm transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1"
                    >
                      <TrashIcon className="w-3 h-3" /> Purge
                    </button>
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
