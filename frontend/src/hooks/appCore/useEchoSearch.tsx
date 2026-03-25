import { useState } from "react";
import axios from "axios";
import type {
    EchoBookGroup,
    EchoRecommendation,
} from "../../components/libraryManager/echoDashboard/echoTypes";
import { useModelRuntime } from "../../components/system/ModelRuntimeProvider";
import { API_BASE_URL } from "../../lib/runtimeConfig";

const API = axios.create({
    baseURL: API_BASE_URL,
});

export function useEchoSearch() {
    const { ensureRolesThen } = useModelRuntime();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [query, setQuery] = useState("");

    // 1. Hold both timeline results and recommendations
    const [results, setResults] = useState<EchoBookGroup[]>([]);
    const [recommendations, setRecommendations] = useState<
        EchoRecommendation[]
    >([]);

    const [loading, setLoading] = useState(false);

    const searchEchoes = async (text: string) => {
        if (!text) return;

        setQuery(text);
        setSidebarOpen(true);
        setLoading(true);

        try {
            const res = await ensureRolesThen(["embedding", "reasoning"], () =>
                API.post("/echo/context", {
                    text: text,
                    limit: 15,
                }),
            );
            if (!res) return;

            // 2. Extract the payload object (handles FastAPI wrappers safely)
            const payload = res.data?.data || res.data || {};

            // 3. Safely split the dictionary into the specific arrays
            const timelineArray = Array.isArray(payload.timeline)
                ? payload.timeline
                : [];
            const recsArray = Array.isArray(payload.recommendations)
                ? payload.recommendations
                : [];

            console.log("Echo Payload Parsed:", {
                timeline: timelineArray.length,
                recs: recsArray.length,
            });

            // 4. Update states
            setResults(timelineArray);
            setRecommendations(recsArray);
        } catch (error) {
            console.error("Echo Search Failed:", error);
            setResults([]);
            setRecommendations([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelection = (manualText?: string) => {
        let text = "";
        if (typeof manualText === "string") {
            text = manualText;
        } else {
            text = window.getSelection()?.toString() || "";
        }

        text = text.trim();

        if (text.length > 0) {
            searchEchoes(text);
        }
    };

    return {
        sidebarOpen,
        setSidebarOpen,
        query,
        results,
        recommendations, // 5. Export the recommendations!
        loading,
        searchEchoes,
        handleSelection,
    };
}
