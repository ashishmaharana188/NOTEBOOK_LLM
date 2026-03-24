import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import type { BrainBook } from "../../types/libraryBackendTypes";
import { notify } from "../../components/system/AppNotifications";

const API = axios.create({
    baseURL: "https://doomprompting123-space.hf.space",
});
const WS_URL = "ws://127.0.0.1:8000/ws";

export function useBackendData() {
    const [libraryFiles, setLibraryFiles] = useState<string[]>([]);
    const [brainBooks, setBrainBooks] = useState<BrainBook[]>([]);
    const [ingesting, setIngesting] = useState<string | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    // 1. Fetch Data
    const refreshAll = useCallback(async () => {
        try {
            const [l, b] = await Promise.all([
                API.get("/library"),
                API.get("/brain/books"),
            ]);
            setLibraryFiles(l.data.files);
            setBrainBooks(b.data.books);
        } catch (err) {
            console.error("Failed to load library data", err);
        }
    }, []);

    // 2. WebSocket Connection
    useEffect(() => {
        refreshAll();
        socketRef.current = new WebSocket(WS_URL);

        socketRef.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === "ingesting") setIngesting(data.filename);
            if (data.status === "complete") {
                setIngesting(null);
                refreshAll();
            }
            if (data.status === "error") {
                setIngesting(null);
                notify({
                    title: "Ingest Error",
                    message: "Ingest Error: " + data.message,
                    tone: "error",
                });
            }
        };

        return () => {
            if (socketRef.current) socketRef.current.close();
        };
    }, [refreshAll]);

    return {
        libraryFiles,
        brainBooks,
        ingesting,
        refreshAll,
    };
}
