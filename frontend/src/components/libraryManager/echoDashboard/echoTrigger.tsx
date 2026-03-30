import React from "react";
import { IonIcon } from "@ionic/react";
import {
  chatbubbleEllipsesOutline,
  closeOutline,
  sparklesOutline,
} from "ionicons/icons";

interface EchoTriggerProps {
  visible: boolean;
  text: string;
  onSearch: () => void;
  onAskRag: (prompt: string) => void;
  onDismiss: () => void;
}

export default function EchoTrigger({
  visible,
  text,
  onSearch,
  onAskRag,
  onDismiss,
}: EchoTriggerProps) {
  const [isPromptOpen, setIsPromptOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState("");

  React.useEffect(() => {
    if (!visible) {
      setIsPromptOpen(false);
      setPrompt("");
    }
  }, [visible]);

  if (!visible || !text) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[10050] w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200 sm:bottom-10 sm:w-auto sm:max-w-none">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-700 bg-accent px-4 py-3 text-accent-text shadow-2xl">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">
            Selection Detected
          </span>
          <span className="text-sm font-medium truncate sm:max-w-[200px]">
            "{text}"
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSearch}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-purple-500"
          >
            <IonIcon icon={sparklesOutline} className="w-4 h-4" />
            Find Echoes
          </button>

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsPromptOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-black"
          >
            <IonIcon icon={chatbubbleEllipsesOutline} className="w-4 h-4" />
            Ask RAG
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-accent-hover"
          >
            <IonIcon icon={closeOutline} className="w-4 h-4" />
          </button>
        </div>

        {isPromptOpen && (
          <div className="space-y-3 border-t border-gray-700 pt-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What should this selection explain or answer?"
              className="h-24 w-full resize-none rounded-lg border border-gray-700 bg-slate-950/40 px-3 py-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-gray-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPromptOpen(false);
                  setPrompt("");
                }}
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextPrompt = prompt.trim();
                  if (!nextPrompt) return;
                  onAskRag(nextPrompt);
                  setIsPromptOpen(false);
                  setPrompt("");
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-900 transition-colors hover:bg-slate-100"
              >
                <IonIcon icon={chatbubbleEllipsesOutline} className="h-4 w-4" />
                Run RAG
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
