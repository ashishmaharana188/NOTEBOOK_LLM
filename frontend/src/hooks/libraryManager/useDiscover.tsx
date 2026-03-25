import { useState, useMemo } from "react";
import axios from "axios";
import type { DiscoveryResult, Facet } from "../../types/libraryBackendTypes";
import { notify } from "../../components/system/AppNotifications";
import { useModelRuntime } from "../../components/system/ModelRuntimeProvider";
import { API_BASE_URL } from "../../lib/runtimeConfig";

const API = axios.create({
    baseURL: API_BASE_URL,
});

export default function useDiscover() {
    const { ensureRolesThen } = useModelRuntime();
    // --- STATE ---
    const [searchSource, setSearchSource] = useState<
        "Gutenberg" | "InternetArchive"
    >("InternetArchive");
    const [discoveryResults, setDiscoveryResults] = useState<DiscoveryResult[]>(
        [],
    );
    const [totalResults, setTotalResults] = useState(0);
    const [facets, setFacets] = useState<Facet[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [searchMessage, setSearchMessage] = useState("");

    // Search Params
    const [simpleQuery, setSimpleQuery] = useState("");
    const [filter, setFilter] = useState("title");
    const [syncingCSV, setSyncingCSV] = useState(false);
    const [cleaningLocal, setCleaningLocal] = useState(false);
    const [hydratingAPI, setHydratingAPI] = useState(false);
    // Client-Side Facet Filter
    const [activeFacet, setActiveFacet] = useState<string | null>(null);

    // Curator Params
    const [limit, setLimit] = useState(25);
    const [selectedGenre, setSelectedGenre] = useState("All");

    // Selection & Download
    const [selectedDiscover, setSelectedDiscover] = useState<Set<string>>(
        new Set(),
    );
    const [downloadFormat, setDownloadFormat] = useState("epub");

    // --- NEW: SYNC STATE ---
    const [syncing, setSyncing] = useState(false);

    // --- FILTERED RESULTS (Client-Side Faceting) ---
    const filteredResults = useMemo(() => {
        if (!activeFacet) return discoveryResults;

        return discoveryResults.filter((book) => {
            // Check Author
            if (book.author && book.author.includes(activeFacet)) return true;
            // Check Subjects/Title/Source for IA
            if (book.source === "InternetArchive") {
                const haystack = `${book.title} ${book.author}`.toLowerCase();
                return haystack.includes(activeFacet.toLowerCase());
            }
            return false;
        });
    }, [discoveryResults, activeFacet]);

    // --- ACTIONS ---

    // 1. Manual Search (Preserves Gutenberg/IA Split)
    const handleSearch = async (overridePage?: number) => {
        setLoading(true);
        setSearchMessage("");
        setActiveFacet(null); // Reset filter on new search
        const currentPage = overridePage || page;

        try {
            let res;
            if (searchSource === "Gutenberg") {
                res = await API.get("/gutenberg/search", {
                    params: { query: simpleQuery, filter, limit },
                });
                setDiscoveryResults(res.data.results || []);
                setTotalResults(res.data.results?.length || 0);
                setFacets([]); // Gutenberg (local) doesn't generate dynamic facets yet
            } else {
                const params: any = {
                    query: simpleQuery,
                    page: currentPage,
                    limit,
                };
                res = await API.get("/ia/search", { params });
                setDiscoveryResults(res.data.results || []);
                setTotalResults(res.data.total || 0);
                setFacets(res.data.facets || []);
            }
        } catch (err) {
            console.error("Manual Search failed", err);
            setSearchMessage("Search failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // 2. Curator Search (Recommendations)
    const handleCuratorSearch = async (topic: string = "") => {
        setLoading(true);
        setSearchMessage(
            topic ? `Curating books for '${topic}'...` : "Analyzing library...",
        );
        setDiscoveryResults([]);
        setActiveFacet(null);

        try {
            const res = await ensureRolesThen(["embedding"], () =>
                API.get("/discover/search_v2", {
                    params: {
                        query: topic, // Pass manual topic if present
                        limit: limit,
                        subject:
                            selectedGenre !== "All" ? selectedGenre : undefined,
                    },
                }),
            );
            if (!res) return;

            if (res.data.results) {
                setDiscoveryResults(res.data.results);
                setTotalResults(res.data.results.length);
            }

            if (res.data.message) {
                setSearchMessage(res.data.message);
            } else if (res.data.results.length === 0) {
                setSearchMessage("No recommendations found.");
            }

            setFacets([]); // Curator results are mixed, no standard facets yet
        } catch (err) {
            console.error("Curator failed", err);
            setSearchMessage("Curator engine failed.");
        } finally {
            setLoading(false);
        }
    };

    // 3. Sync Action (The Waterfall Pipeline)
    // 3. Master Sync Action (CSVs -> Physical Files -> API Hydration)
    const handleSync = async () => {
        setSyncing(true);
        try {
            console.log("Phase 1: Absorbing CSV datasets...");
            const res = await API.post("/recommender/sync");

            console.log("Phase 2: Registering files & Hydrating from APIs...");
            await API.post("/library/refresh");

            notify({
                title: "Master Sync Initiated",
                message:
                    `Synced ${res.data.count || "database"} CSV entries.\n` +
                    `Registered physical library files.\n` +
                    `The high-speed API hydrator is now running in the background to fetch missing metadata.`,
                tone: "success",
                durationMs: 6200,
            });
        } catch (e) {
            console.error("Master Sync failed", e);
            notify({
                title: "Pipeline Failed",
                message: "Pipeline failed. Check the console and backend logs.",
                tone: "error",
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncCSV = async () => {
        setSyncingCSV(true);
        try {
            const res = await API.post("/recommender/sync");
            notify({
                title: "CSV Sync Complete",
                message: `Synced ${res.data.count || "database"} CSV entries!`,
                tone: "success",
            });
        } catch (e) {
            console.error("CSV Sync failed", e);
            notify({
                title: "CSV Sync Failed",
                message: "CSV Sync failed. Check logs.",
                tone: "error",
            });
        } finally {
            setSyncingCSV(false);
        }
    };

    const handleCleanLocal = async () => {
        setCleaningLocal(true);
        try {
            await API.post("/library/clean_local");
            notify({
                title: "Local Clean Started",
                message:
                    "Started cleaning local files and registering them to the database. Check backend terminal for progress.",
                tone: "success",
                durationMs: 5200,
            });
        } catch (e) {
            console.error("Local Clean failed", e);
            notify({
                title: "Local Clean Failed",
                message: "Local Clean failed.",
                tone: "error",
            });
        } finally {
            setCleaningLocal(false);
        }
    };

    const handleHydrateAPI = async () => {
        setHydratingAPI(true);
        try {
            await API.post("/library/hydrate_api");
            notify({
                title: "API Hydrator Started",
                message:
                    "API hydrator started in the background. Check backend terminal for progress.",
                tone: "success",
                durationMs: 5200,
            });
        } catch (e) {
            console.error("API Hydration failed", e);
            notify({
                title: "API Hydration Failed",
                message: "API Hydration failed.",
                tone: "error",
            });
        } finally {
            setHydratingAPI(false);
        }
    };

    // --- HELPERS ---

    const toggleFacet = (facetName: string) => {
        if (activeFacet === facetName) {
            setActiveFacet(null);
        } else {
            setActiveFacet(facetName);
        }
    };

    const changePage = (newPage: number) => {
        setPage(newPage);
        handleSearch(newPage);
    };

    const handleDownload = async (book: DiscoveryResult, format: string) => {
        const endpoint =
            book.source === "Gutenberg"
                ? "/gutenberg/download"
                : "/ia/download";
        const payload =
            book.source === "Gutenberg"
                ? {
                      book_id: book.id,
                      title: book.title,
                      preferred_format: format,
                  }
                : {
                      identifier: book.id,
                      title: book.title,
                      preferred_format: format,
                  };

        try {
            console.log(`Starting download for ${book.title}...`);
            await API.post(endpoint, payload);
        } catch (err) {
            console.error("Download failed to start", err);
        }
    };

    const handleDirectIngest = async (
        book: DiscoveryResult,
        format: string,
    ) => {
        const endpoint =
            book.source === "Gutenberg"
                ? "/gutenberg/ingest-direct"
                : "/ia/ingest";
        const payload =
            book.source === "Gutenberg"
                ? {
                      book_id: book.id,
                      title: book.title,
                      preferred_format: format,
                      author: book.author,
                      year: parseInt(book.year) || 0,
                  }
                : {
                      identifier: book.id,
                      title: book.title,
                      preferred_format: format,
                      author: book.author,
                      year: parseInt(book.year) || 0,
                  };

        try {
            console.log(`Starting ingestion for ${book.title}...`);
            await ensureRolesThen(["embedding"], () =>
                API.post(endpoint, payload),
            );
        } catch (err) {
            console.error("Ingest failed to start", err);
        }
    };

    const toggleDiscover = (id: string) => {
        const next = new Set(selectedDiscover);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedDiscover(next);
    };

    const toggleAllDiscover = () => {
        if (selectedDiscover.size === filteredResults.length) {
            setSelectedDiscover(new Set());
        } else {
            const allIds = filteredResults.map((r) => r.id);
            setSelectedDiscover(new Set(allIds));
        }
    };

    const handleBulkDownload = async () => {
        const selectedBooks = filteredResults.filter((b) =>
            selectedDiscover.has(b.id),
        );
        for (const book of selectedBooks) {
            await handleDownload(book, downloadFormat);
        }
        setSelectedDiscover(new Set());
    };

    const handleBulkIngest = async () => {
        const selectedBooks = filteredResults.filter((b) =>
            selectedDiscover.has(b.id),
        );
        for (const book of selectedBooks) {
            await handleDirectIngest(book, downloadFormat);
        }
        setSelectedDiscover(new Set());
    };

    return {
        // Search State
        searchSource,
        setSearchSource,
        filteredResults, // Using the memoized filtered list
        totalResults,
        facets,
        page,
        simpleQuery,
        setSimpleQuery,
        filter,
        setFilter,
        loading,
        searchMessage,
        activeFacet,
        toggleFacet,

        // Curator State
        limit,
        setLimit,
        selectedGenre,
        setSelectedGenre,
        handleCuratorSearch,

        // Sync State
        syncing,
        handleSync,

        // Actions
        selectedDiscover,
        toggleDiscover,
        toggleAllDiscover,
        downloadFormat,
        setDownloadFormat,
        handleSearch,
        changePage,
        handleDownload,
        handleDirectIngest,
        handleBulkDownload,
        handleBulkIngest,
        handleSyncCSV,
        syncingCSV,
        handleCleanLocal,
        cleaningLocal,
        handleHydrateAPI,
        hydratingAPI,
    };
}
