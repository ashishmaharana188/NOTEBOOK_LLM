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
    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="bg-accent text-accent-text px-4 py-3 rounded-xl shadow-2xl flex items-center gap-4 border border-gray-700">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase text-gray-400 font-bold tracking-wider">
            Selection Detected
          </span>
          <span className="text-sm font-medium max-w-[200px] truncate">
            "{text}"
          </span>
        </div>

        <div className="h-8 w-[1px] bg-gray-700"></div>

        <button
          onClick={onSearch}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg"
        >
          <SparklesIcon className="w-4 h-4" />
          Find Echoes
        </button>

        <button
          onClick={onDismiss}
          className="p-1.5 hover:bg-accent-hover rounded-full text-gray-400 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
