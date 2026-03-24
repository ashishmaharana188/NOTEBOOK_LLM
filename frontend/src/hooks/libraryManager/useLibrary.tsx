import { useState } from "react";
import { confirmAction } from "../../components/system/AppNotifications";

export interface MyLibraryLogicProps {
  libraryFiles: string[];
  onIngest: (file: string) => Promise<void>;
  onDelete: (file: string, bulk?: boolean) => Promise<void>;
}

export default function useLibrary({
  libraryFiles,
  onIngest,
  onDelete,
}: MyLibraryLogicProps) {
  const [selectedLib, setSelectedLib] = useState<Set<string>>(new Set());

  // Toggles
  const toggleLib = (file: string) => {
    const next = new Set(selectedLib);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    setSelectedLib(next);
  };

  const toggleAllLib = () => {
    if (selectedLib.size === libraryFiles.length) setSelectedLib(new Set());
    else setSelectedLib(new Set(libraryFiles));
  };

  // Bulk Actions
  const handleBulkIngest = async () => {
    for (const file of selectedLib) await onIngest(file);
    setSelectedLib(new Set());
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirmAction({
      title: "Delete Files",
      message: `Delete ${selectedLib.size} files?`,
      tone: "error",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    for (const file of selectedLib) await onDelete(file, true);
    setSelectedLib(new Set());
  };

  return {
    selectedLib,
    toggleLib,
    toggleAllLib,
    handleBulkIngest,
    handleBulkDelete,
  };
}
