import React from "react";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface EchoTriggerProps {
  visible: boolean;
  text: string;
  onSearch: () => void;
  onDismiss: () => void;
}

export default function EchoTrigger({
  visible,
  text,
  onSearch,
  onDismiss,
}: EchoTriggerProps) {
  if (!visible || !text) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100vw-1rem)] max-w-md -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-200 sm:bottom-10 sm:w-auto sm:max-w-none">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-700 bg-accent px-4 py-3 text-accent-text shadow-2xl sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">
            Selection Detected
          </span>
          <span className="text-sm font-medium truncate sm:max-w-[200px]">
            "{text}"
          </span>
        </div>

        <div className="hidden h-8 w-[1px] bg-gray-700 sm:block"></div>

        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSearch}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-lg transition-colors hover:bg-purple-500"
          >
            <SparklesIcon className="w-4 h-4" />
            Find Echoes
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-accent-hover"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
