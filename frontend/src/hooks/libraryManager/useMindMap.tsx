import { useState, useEffect } from "react";
import axios from "axios";
import { useRefreshBus } from "../../components/system/RefreshBusProvider";
import { API_BASE_URL } from "../../lib/runtimeConfig";

export default function useMindMap() {
    const { subscribe } = useRefreshBus();
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);

    const fetchGraph = async () => {
        setLoading(true);
        try {
            const API = axios.create({
                baseURL: API_BASE_URL,
            });
            const res = await API.get("/graph/core");
            if (res.data.status === "success") {
                setGraphData(res.data.data);
            }
        } catch (e) {
            console.error("Failed to fetch graph:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGraph();
    }, []);

    useEffect(() => {
        return subscribe((scopes) => {
            if (scopes.includes("mindmap.graph")) {
                fetchGraph();
            }
        });
    }, [subscribe]);

    return { graphData, loading, fetchGraph };
}
