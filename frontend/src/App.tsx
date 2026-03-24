import React, { useEffect, useRef, useState } from "react";
import useCognition from "./hooks/useCognition";
import MainReader from "./components/reader/mainReader";
import Sidebar from "./components/sideBar/sidebarUI";
import EchoTrigger from "./components/libraryManager/echoDashboard/echoTrigger";
import LibraryManager from "./components/libraryManager/libraryManagerUI";
import WorkspaceShellUI from "./components/libraryManager/workspaceShellUI";
import type { DownloadingBook } from "./types/readerBackendTypes";

const WS_URL = "ws://127.0.0.1:8000/ws";

interface WebSocketMessage {
  status?: string;
  type?: string;
  filename?: string;
  message?: string;
  id?: string;
}

function App() {
  const {
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
    results,
    query,
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
    recommendations,
  } = useCognition();

  const [downloadingBooks, setDownloadingBooks] = useState<DownloadingBook[]>(
    [],
  );
  const [workspaceView, setWorkspaceView] = useState<
    "ECHOES" | "NOTES" | "SPATIAL"
  >("ECHOES");

  const socketRef = useRef<WebSocket | null>(null);
  const isReaderActive = view === "READER" && Boolean(currentBook);

  useEffect(() => {
    refreshAll();
    socketRef.current = new WebSocket(WS_URL);
    socketRef.current.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        if (data.type === "DOWNLOAD_COMPLETE") {
          setDownloadingBooks((prev) =>
            prev.filter((b) => b.id !== data.id && b.filename !== data.filename),
          );
          refreshAll();
        }
      } catch (e) {
        console.error("WS Error", e);
      }
    };
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [refreshAll]);

  const handleStartDownload = (book: any) => {
    setDownloadingBooks((prev) =>
      prev.find((b) => b.title === book.title)
        ? prev
        : [...prev, { filename: book.title, title: book.title, id: book.id }],
    );
    setLibraryOpen(true);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-primary font-sans relative">
      {libraryOpen ? (
        <Sidebar
          view={view}
          setView={setView}
          libraryFiles={libraryFiles}
          downloadingBooks={downloadingBooks}
          currentBook={currentBook}
          onReadLibrary={loadBook}
          onDeleteLibrary={deleteLibraryFile}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}

      <div className="flex-1 min-w-0 h-full relative overflow-hidden">
        {!libraryOpen ? (
          <button
            onClick={() => setLibraryOpen(true)}
            className={`absolute top-4 left-4 z-[60] rounded-lg border p-2.5 shadow-sm transition-all ${
              isReaderActive
                ? "bg-surface/90 border-black/10 text-primary hover:bg-canvas"
                : "bg-surface border-border-subtle text-gray-600 hover:bg-canvas"
            }`}
            title="Open sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        ) : null}

        <div className="h-full w-full overflow-hidden relative min-w-0">
          {isReaderActive ? (
            <MainReader
              book={currentBook}
              bookContent={bookContent}
              onSelection={handleSelection}
            />
          ) : (
            <LibraryManager
              libraryFiles={libraryFiles}
              brainBooks={brainBooks}
              ingesting={ingesting}
              ingestQueue={ingestQueue}
              onUpload={uploadFile}
              onIngest={ingestFile}
              onCancelIngest={cancelIngest}
              onDeleteLibrary={deleteLibraryFile}
              onDeleteBrain={deleteBrainBook}
              onRead={loadBook}
              onStartDownload={handleStartDownload}
              onOpenGlobalWorkspace={(
                targetView: "ECHOES" | "NOTES" | "SPATIAL",
              ) => {
                setWorkspaceView(targetView);
                setEchoOpen(true);
              }}
            />
          )}
        </div>
      </div>

      <EchoTrigger
        visible={triggerVisible}
        text={selectedText}
        onSearch={() => {
          searchEchoes();
          setWorkspaceView("ECHOES");
          setEchoOpen(true);
          dismissTrigger();
        }}
        onDismiss={dismissTrigger}
      />

      {!isReaderActive ? (
        <WorkspaceShellUI
          isOpen={echoOpen}
          onClose={() => setEchoOpen(false)}
          onOpen={() => setEchoOpen(true)}
          currentView={workspaceView}
          results={results}
          recommendations={recommendations}
          query={query}
          loading={loading}
          activeBookTitle={currentBook?.title || "Current Focus"}
          activeBookAuthor={currentBook?.author || "Active Selection"}
          libraryId={currentBook?.lid || ""}
        />
      ) : null}
    </div>
  );
}

export default App;
