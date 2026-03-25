import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import axios from "axios";
import { useRefreshBus } from "./RefreshBusProvider";
import { buildApiUrl } from "../../lib/runtimeConfig";

interface CanvasSnapshotContextValue {
    clusters: any[];
    notes: any[];
    manualLinks: any[];
    spatialMetadata: Record<string, any>;
    loading: boolean;
    loaded: boolean;
    refreshCanvasSnapshot: () => Promise<void>;
    ensureCanvasSnapshot: () => Promise<void>;
    setCanvasSnapshotActive: (active: boolean) => void;
}

const CanvasSnapshotContext = createContext<CanvasSnapshotContextValue | null>(
    null,
);

export function CanvasSnapshotProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { subscribe } = useRefreshBus();

    const [clusters, setClusters] = useState<any[]>([]);
    const [notes, setNotes] = useState<any[]>([]);
    const [manualLinks, setManualLinks] = useState<any[]>([]);
    const [spatialMetadata, setSpatialMetadata] = useState<Record<string, any>>(
        {},
    );
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const fetchReq = useRef(0);
    const inFlightRefreshRef = useRef<Promise<void> | null>(null);

    const refreshCanvasSnapshot = useCallback(async () => {
        if (inFlightRefreshRef.current) {
            return inFlightRefreshRef.current;
        }

        const currentReq = ++fetchReq.current;
        const refreshPromise = (async () => {
            setLoading(true);
            try {
                const res = await axios.get(buildApiUrl("/brain/echoes/saved"));
                if (
                    currentReq === fetchReq.current &&
                    res.data.status === "success"
                ) {
                    const normalizedClusters = (res.data.data || []).map(
                        (cluster: any) => ({
                            ...cluster,
                            id: cluster.id || cluster.cluster_id,
                        }),
                    );
                    setClusters(normalizedClusters);
                    setNotes(res.data.notes || []);
                    setManualLinks(res.data.manual_links || []);
                    setSpatialMetadata(res.data.spatial_metadata || {});
                    setLoaded(true);
                    setDirty(false);
                }
            } catch (error) {
                console.error("Failed to fetch canvas snapshot", error);
            } finally {
                if (currentReq === fetchReq.current) {
                    setLoading(false);
                }
            }
        })();

        inFlightRefreshRef.current = refreshPromise;
        try {
            await refreshPromise;
        } finally {
            if (inFlightRefreshRef.current === refreshPromise) {
                inFlightRefreshRef.current = null;
            }
        }
    }, []);

    const ensureCanvasSnapshot = useCallback(async () => {
        if (!loaded || dirty) {
            await refreshCanvasSnapshot();
        }
    }, [dirty, loaded, refreshCanvasSnapshot]);

    useEffect(() => {
        if (isActive && (!loaded || dirty)) {
            refreshCanvasSnapshot();
        }
    }, [dirty, isActive, loaded, refreshCanvasSnapshot]);

    useEffect(() => {
        return subscribe((scopes) => {
            if (!scopes.includes("canvas.snapshot")) return;
            if (isActive || loaded) {
                refreshCanvasSnapshot();
            } else {
                setDirty(true);
            }
        });
    }, [isActive, loaded, refreshCanvasSnapshot, subscribe]);

    const value = useMemo(
        () => ({
            clusters,
            notes,
            manualLinks,
            spatialMetadata,
            loading,
            loaded,
            refreshCanvasSnapshot,
            ensureCanvasSnapshot,
            setCanvasSnapshotActive: setIsActive,
        }),
        [
            clusters,
            ensureCanvasSnapshot,
            loaded,
            loading,
            manualLinks,
            notes,
            refreshCanvasSnapshot,
            spatialMetadata,
        ],
    );

    return (
        <CanvasSnapshotContext.Provider value={value}>
            {children}
        </CanvasSnapshotContext.Provider>
    );
}

export function useCanvasSnapshot() {
    const context = useContext(CanvasSnapshotContext);
    if (!context) {
        throw new Error(
            "useCanvasSnapshot must be used within CanvasSnapshotProvider",
        );
    }
    return context;
}
