import { useState } from "react";
import type { BrainBook } from "../../types/libraryBackendTypes";
import { confirmAction } from "../../components/system/AppNotifications";

export interface TheBrainLogicProps {
  brainBooks: BrainBook[];
  onDelete: (file: string, bulk?: boolean) => Promise<void>;
}

export default function useTheBrain({
  brainBooks,
  onDelete,
}: TheBrainLogicProps) {
  const [selectedBrain, setSelectedBrain] = useState<Set<string>>(new Set());

  const toggleBrain = (file: string) => {
    const next = new Set(selectedBrain);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    setSelectedBrain(next);
  };

  const toggleAllBrain = () => {
    if (selectedBrain.size === brainBooks.length) setSelectedBrain(new Set());
    else setSelectedBrain(new Set(brainBooks.map((b) => b.filename)));
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirmAction({
      title: "Forget Memories",
      message: `Forget ${selectedBrain.size} memories?`,
      tone: "warning",
      confirmLabel: "Forget",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    for (const file of selectedBrain) await onDelete(file, true);
    setSelectedBrain(new Set());
  };

  return { selectedBrain, toggleBrain, toggleAllBrain, handleBulkDelete };
}
