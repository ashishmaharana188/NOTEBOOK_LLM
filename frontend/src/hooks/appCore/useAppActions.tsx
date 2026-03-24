import axios from "axios";
import {
  confirmAction,
  notify,
} from "../../components/system/AppNotifications";
import { useModelRuntime } from "../../components/system/ModelRuntimeProvider";

const API = axios.create({ baseURL: "http://127.0.0.1:8000" });

export function useGlobalActions(refreshAll: () => Promise<void>) {
  const { ensureRolesThen } = useModelRuntime();
  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await API.post("/ingest", formData);
      refreshAll();
    } catch (err) {
      notify({ title: "Upload Failed", message: "Upload failed", tone: "error" });
      console.error(err);
    }
  };

  const ingestFile = async (filename: string) => {
    try {
      await ensureRolesThen(["embedding"], () =>
        API.post("/brain/ingest", { filename }),
      );
    } catch (err) {
      notify({
        title: "Ingest Failed",
        message: "Ingest request failed",
        tone: "error",
      });
      console.error(err);
    }
  };

  const deleteLibraryFile = async (filename: string, bulk = false) => {
    if (!bulk) {
      const confirmed = await confirmAction({
        title: "Delete File",
        message: `Delete ${filename}?`,
        tone: "error",
        confirmLabel: "Delete",
        cancelLabel: "Keep",
      });
      if (!confirmed) return;
    }
    try {
      await API.delete(`/library/${filename}`);
      refreshAll();
    } catch (err) {
      notify({ title: "Delete Failed", message: "Delete failed", tone: "error" });
      console.error(err);
    }
  };

  const deleteBrainBook = async (filename: string, bulk = false) => {
    if (!bulk) {
      const confirmed = await confirmAction({
        title: "Forget Memory",
        message: `Forget ${filename}?`,
        tone: "warning",
        confirmLabel: "Forget",
        cancelLabel: "Keep",
      });
      if (!confirmed) return;
    }
    try {
      await API.delete(`/brain/${filename}`);
      refreshAll();
    } catch (err) {
      notify({ title: "Forget Failed", message: "Delete failed", tone: "error" });
      console.error(err);
    }
  };

  return {
    uploadFile,
    ingestFile,
    deleteLibraryFile,
    deleteBrainBook,
  };
}
