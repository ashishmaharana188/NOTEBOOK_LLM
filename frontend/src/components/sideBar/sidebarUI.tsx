import React, { useState, useEffect } from "react";
import {
  MagnifyingGlassIcon,
  TrashIcon,
  ChevronLeftIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import type {
  ReaderBook,
  DownloadingBook,
} from "../../types/readerBackendTypes";

interface SidebarProps {
  view: string;
  setView: (view: string) => void;
  libraryFiles: string[];
  downloadingBooks: DownloadingBook[];
  currentBook: ReaderBook | null;
  onReadLibrary: (filename: string) => void;
  onDeleteLibrary: (filename: string) => void;
  onClose: () => void;
}

export default function Sidebar({
  view,
  setView,
  libraryFiles = [],
  downloadingBooks = [],
  currentBook,
  onReadLibrary,
  onDeleteLibrary,
  onClose,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [recentBooks, setRecentBooks] = useState<string[]>([]);

  // 1. Load recently opened books on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cognition_recent_books");
      if (stored) setRecentBooks(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load recent books", e);
    }
  }, []);

  // 2. Automatically track newly opened books (from anywhere in the app)
  useEffect(() => {
    if (currentBook?.filename) {
      setRecentBooks((prev) => {
        const filename = currentBook.filename;
        // Add to top, remove duplicates, keep only top 10
        const updated = [filename, ...prev.filter((f) => f !== filename)].slice(
          0,
          10
        );
        localStorage.setItem("cognition_recent_books", JSON.stringify(updated));
        return updated;
      });
    }
  }, [currentBook]);

  // Reset pagination when user types a new search query
  useEffect(() => {
    setVisibleCount(10);
  }, [searchTerm]);

  // 3. Dynamic Filtering Logic
  // Filter out any recent books that might have been deleted from the library
  const validRecentBooks = recentBooks.filter((f) => libraryFiles.includes(f));

  // If no search term, show top 10 recents. If searching, show matching files from the whole library.
  const displayLibrary =
    searchTerm.trim() === ""
      ? validRecentBooks.slice(0, 10)
      : libraryFiles
          .filter((f) => f.toLowerCase().includes(searchTerm.toLowerCase()))
          .sort((a, b) => a.localeCompare(b));

  const filteredDownloading = downloadingBooks.filter((b) =>
    (b.title || b.filename).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Slice the array for DOM performance (only applies when searching)
  const visibleLibrary =
    searchTerm.trim() === ""
      ? displayLibrary
      : displayLibrary.slice(0, visibleCount);

  // Lazy loading scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      if (visibleCount < displayLibrary.length) {
        setVisibleCount((prev) => prev + 10);
      }
    }
  };

  return (
    <div className="h-full w-full bg-canvas text-primary flex flex-col border-r border-border-subtle flex-shrink-0 z-20 transition-all duration-300 font-sans sm:w-72">
      {/* Header */}
      <div className="p-5 pb-4">
        {/* Title & Close Row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-primary">
            <div className="w-2.5 h-2.5 bg-slate-800 rounded-sm"></div>
            <h1 className="font-bold tracking-widest text-sm uppercase font-mono">
              COGNITION
            </h1>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-sm text-muted hover:text-primary transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        {/* Navigation */}
        <div className="flex bg-slate-200/50 p-0.5 rounded-sm border border-border-subtle mb-4">
          <button
            onClick={() => setView("READER")}
            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
              view === "READER"
                ? "bg-surface text-primary shadow-sm border border-border-subtle/50"
                : "text-muted hover:text-slate-700"
            }`}
          >
            Read
          </button>
          <button
            onClick={() => {
              setView("LIBRARY");
              // NEW: Force LibraryManagerUI to reset its internal tab
              window.dispatchEvent(
                new CustomEvent("SWITCH_TAB", { detail: "LIBRARY" })
              );
            }}
            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
              view === "LIBRARY"
                ? "bg-surface text-primary shadow-sm border border-border-subtle/50"
                : "text-muted hover:text-slate-700"
            }`}
          >
            Library
          </button>
        </div>

        {/* Search */}
        <div className="relative group">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search all files..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            className="w-full bg-surface border border-border-subtle text-slate-700 text-xs font-mono rounded-sm pl-8 pr-3 py-2 focus:outline-none focus:border-slate-400 focus:ring-0 transition-all placeholder:text-muted shadow-sm"
          />
        </div>
      </div>

      {/* Lists (With lazy load scroll listener attached) */}
      <div
        className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 custom-scrollbar"
        onScroll={handleScroll}
      >
        <div className="px-2 mb-3 flex items-center justify-between text-[9px] font-mono font-bold uppercase tracking-widest text-muted mt-2">
          <span>
            {searchTerm.trim() === "" ? "Recently Opened" : "Search Results"}
          </span>
          <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-sm">
            {displayLibrary.length + filteredDownloading.length}
          </span>
        </div>

        {/* Downloading Items */}
        {filteredDownloading.map((book) => (
          <div
            key={`download-${book.title}`}
            className="w-full text-left px-3 py-2.5 rounded-sm text-xs flex items-center justify-between bg-slate-100 border border-border-subtle pointer-events-none mb-1 shadow-sm"
          >
            <div className="flex-1 flex items-center gap-3 overflow-hidden">
              <ArrowPathIcon className="w-3.5 h-3.5 text-muted animate-spin flex-shrink-0" />
              <span className="font-medium truncate text-slate-600 font-sans">
                {book.title}
              </span>
            </div>
            <span className="text-[9px] text-muted font-mono font-bold uppercase tracking-widest pl-2">
              Fetch
            </span>
          </div>
        ))}

        {/* Library Items */}
        {displayLibrary.length === 0 && filteredDownloading.length === 0 ? (
          <p className="px-2 text-[10px] font-mono uppercase tracking-widest text-muted italic pt-2 text-center">
            {searchTerm.trim() === "" ? "No recent books." : "No files found."}
          </p>
        ) : (
          visibleLibrary.map((filename) => {
            const isActive = currentBook?.filename === filename;
            return (
              <div
                key={filename}
                className={`w-full text-left px-3 py-2.5 rounded-sm text-sm transition-all group flex items-center justify-between cursor-pointer border ${
                  isActive
                    ? "bg-surface border-slate-300 shadow-sm text-primary"
                    : "border-transparent text-slate-600 hover:bg-slate-100/50 hover:text-primary"
                }`}
                onClick={() => onReadLibrary(filename)}
              >
                <button className="flex-1 text-left truncate flex items-center gap-3 outline-none">
                  <span
                    className={`truncate font-sans ${
                      isActive ? "font-bold" : "font-medium"
                    }`}
                  >
                    {filename}
                  </span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLibrary(filename);
                  }}
                  className="ml-2 p-1 opacity-100 transition-all hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                  title="Delete File"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
