import React, { Suspense, useEffect, useRef, useState } from "react";
import useCognition from "./hooks/useCognition";
import MainReader from "./components/reader/mainReader";
import Sidebar from "./components/sideBar/sidebarUI";
import EchoTrigger from "./components/libraryManager/echoDashboard/echoTrigger";
import LibraryManager from "./components/libraryManager/libraryManagerUI";
import type { DownloadingBook } from "./types/readerBackendTypes";
import { BACKEND_WS_URL } from "./lib/runtimeConfig";
import useIsMobile from "./hooks/appTools/useIsMobile";

const WorkspaceShellUI = React.lazy(
  () => import("./components/libraryManager/workspaceShellUI"),
);

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
    echoSearchVersion,
  } = useCognition();

  const [downloadingBooks, setDownloadingBooks] = useState<DownloadingBook[]>(
    [],
  );
  const [workspaceView, setWorkspaceView] = useState<
    "ECHOES" | "NOTES" | "SPATIAL"
  >("ECHOES");

  const socketRef = useRef<WebSocket | null>(null);
  const isMobile = useIsMobile();
  const isReaderActive = view === "READER" && Boolean(currentBook);
  const shouldRenderWorkspaceShell =
    !isReaderActive ||
    echoOpen ||
    loading ||
    results.length > 0 ||
    recommendations.length > 0;

  useEffect(() => {
    refreshAll();
    socketRef.current = new WebSocket(BACKEND_WS_URL);
    socketRef.current.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        if (data.type === "DOWNLOAD_COMPLETE") {
          setDownloadingBooks((prev) =>
            prev.filter(
              (b) => b.id !== data.id && b.filename !== data.filename,
            ),
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
    <div className="flex h-[100dvh] w-full overflow-hidden bg-surface text-primary font-sans relative">
      {libraryOpen && !isMobile ? (
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

      {libraryOpen && isMobile ? (
        <div className="fixed inset-0 z-[120] sm:hidden">
          <div
            className="absolute inset-0 bg-slate-900/45  -[1px]"
            onClick={() => setLibraryOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(88vw,20rem)] max-w-full">
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
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-w-0 h-full relative overflow-hidden">
        {!libraryOpen ? (
          <button
            onClick={() => setLibraryOpen(true)}
            className={`absolute top-3 left-3 z-[60] rounded-lg border p-2.5 shadow-sm transition-all sm:top-4 sm:left-4 ${
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
          searchEchoes(selectedText);
          setWorkspaceView("ECHOES");
          setEchoOpen(true);
          dismissTrigger();
        }}
        onDismiss={dismissTrigger}
      />

      {shouldRenderWorkspaceShell ? (
        <Suspense fallback={null}>
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
            echoSearchVersion={echoSearchVersion}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
