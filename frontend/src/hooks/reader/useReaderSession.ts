import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import type {
    ReaderAnnotation,
    ReaderBook,
    ReaderBootstrapPayload,
    ReaderLocationPayload,
    ReaderManifestSection,
    ReaderManifestSummary,
    ReaderSession,
} from "../../types/readerBackendTypes";
import { notify } from "../../components/system/AppNotifications";

const API = axios.create({
    baseURL: "https://doomprompting123-space.hf.space",
});
const WS_URL = "ws://127.0.0.1:8000/ws";
const LOCAL_CACHE_PREFIX = "reader_bootstrap_v2:";

function toLocationValue(raw: unknown): string | number | null {
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw === "number") return raw;
    if (typeof raw !== "string") return String(raw);
    const numeric = Number(raw);
    if (
        !Number.isNaN(numeric) &&
        raw.trim() !== "" &&
        String(numeric) === raw
    ) {
        return numeric;
    }
    return raw;
}

function getCacheKey(filename: string) {
    return `${LOCAL_CACHE_PREFIX}${filename}`;
}

export function useReaderSession(book: ReaderBook | null) {
    const [isBootstrapping, setIsBootstrapping] = useState(false);
    const [manifest, setManifest] = useState<ReaderManifestSummary | null>(
        null,
    );
    const [session, setSession] = useState<ReaderSession | null>(null);
    const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
    const [readerLocation, setReaderLocation] = useState<
        string | number | null
    >(null);
    const [currentTextSection, setCurrentTextSection] = useState<number>(0);
    const [loadedTextSections, setLoadedTextSections] = useState<
        Record<number, ReaderManifestSection>
    >({});

    const wsRef = useRef<WebSocket | null>(null);
    const bootstrapPollRef = useRef<number | null>(null);
    const flushTimeoutRef = useRef<number | null>(null);
    const currentLocationRef = useRef<ReaderLocationPayload | null>(null);
    const hasHydratedLocationRef = useRef(false);
    const sessionDirtyRef = useRef(false);

    const isTextFormat = useMemo(() => {
        const extension = String(book?.extension || "").toLowerCase();
        return extension === "txt" || extension === "md";
    }, [book?.extension]);

    const persistLocalCache = useCallback(
        (payload: Record<string, any>) => {
            if (!book?.filename) return;
            try {
                const cacheKey = getCacheKey(book.filename);
                const existingRaw = localStorage.getItem(cacheKey);
                const existing = existingRaw ? JSON.parse(existingRaw) : {};
                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({
                        ...existing,
                        ...payload,
                    }),
                );
            } catch {
                // Ignore cache failures.
            }
        },
        [book?.filename],
    );

    const clearPendingFlush = useCallback(() => {
        if (flushTimeoutRef.current) {
            window.clearTimeout(flushTimeoutRef.current);
            flushTimeoutRef.current = null;
        }
    }, []);

    const refreshBootstrap = useCallback(async () => {
        if (!book?.filename) return null;
        setIsBootstrapping(true);
        try {
            const response = await API.get(
                `/reader/books/${encodeURIComponent(book.filename)}/bootstrap`,
                {
                    params: book.lid ? { lid: book.lid } : {},
                },
            );
            const payload = response.data?.data as ReaderBootstrapPayload;
            if (!payload) return null;

            setManifest(payload.manifest || null);
            setSession(payload.session || null);
            setAnnotations(
                Array.isArray(payload.annotations) ? payload.annotations : [],
            );

            const lastLocation = toLocationValue(
                payload.session?.last_location,
            );
            if (!hasHydratedLocationRef.current) {
                setReaderLocation(lastLocation);
                hasHydratedLocationRef.current = true;
                currentLocationRef.current =
                    lastLocation !== null
                        ? {
                              location: lastLocation,
                              locationType:
                                  payload.session?.last_location_type || "",
                              progressPercent:
                                  payload.session?.progress_percent || 0,
                              pageLabel: payload.session?.last_page_label || "",
                              viewState: payload.session?.view_state || {},
                          }
                        : null;
            }

            if (isTextFormat) {
                const initialSection = Math.max(
                    0,
                    Number(
                        toLocationValue(payload.session?.last_location) || 0,
                    ),
                );
                setCurrentTextSection(initialSection);
            }

            persistLocalCache(payload);
            return payload;
        } catch (error) {
            console.error("Reader bootstrap failed", error);
            notify({
                title: "Reader Sync Failed",
                message: "Could not load the latest reading state.",
                tone: "error",
            });
            return null;
        } finally {
            setIsBootstrapping(false);
        }
    }, [book?.filename, book?.lid, isTextFormat, persistLocalCache]);

    const flushSession = useCallback(async () => {
        if (
            !book?.filename ||
            !sessionDirtyRef.current ||
            !currentLocationRef.current
        ) {
            return;
        }

        clearPendingFlush();
        const snapshot = currentLocationRef.current;
        sessionDirtyRef.current = false;

        try {
            const response = await API.put(
                `/reader/books/${encodeURIComponent(book.filename)}/session`,
                {
                    lid: book.lid || "",
                    format: book.extension || "",
                    last_location: snapshot.location,
                    last_location_type: snapshot.locationType || "",
                    progress_percent: snapshot.progressPercent || 0,
                    last_page_label: snapshot.pageLabel || "",
                    view_state: snapshot.viewState || {},
                },
            );
            const nextSession = response.data?.data as ReaderSession;
            if (nextSession) {
                setSession(nextSession);
                persistLocalCache({ session: nextSession });
            }
        } catch (error) {
            console.error("Reader session flush failed", error);
            sessionDirtyRef.current = true;
        }
    }, [
        book?.extension,
        book?.filename,
        book?.lid,
        clearPendingFlush,
        persistLocalCache,
    ]);

    const scheduleSessionFlush = useCallback(() => {
        clearPendingFlush();
        flushTimeoutRef.current = window.setTimeout(() => {
            void flushSession();
        }, 700);
    }, [clearPendingFlush, flushSession]);

    const reportLocation = useCallback(
        (payload: ReaderLocationPayload) => {
            currentLocationRef.current = payload;
            sessionDirtyRef.current = true;
            persistLocalCache({
                session: {
                    ...(session || ({} as ReaderSession)),
                    last_location: String(payload.location),
                    last_location_type: payload.locationType || "",
                    progress_percent: payload.progressPercent || 0,
                    last_page_label: payload.pageLabel || "",
                    view_state: payload.viewState || {},
                },
            });
            scheduleSessionFlush();
        },
        [persistLocalCache, scheduleSessionFlush, session],
    );

    const loadTextSections = useCallback(
        async (sectionIndex: number, limit = 1) => {
            if (!book?.filename || !isTextFormat) return;
            try {
                const response = await API.get(
                    `/reader/books/${encodeURIComponent(book.filename)}/content`,
                    {
                        params: {
                            lid: book.lid || "",
                            section: sectionIndex,
                            limit,
                        },
                    },
                );
                const payload = response.data?.data;
                if (payload?.manifest) {
                    setManifest((prev) => ({
                        ...(prev || {
                            status: payload.manifest_status || "ready",
                            page_count: 0,
                            toc: [],
                            section_index: [],
                            location_map: [],
                            content_meta: {},
                        }),
                        ...payload.manifest,
                        status:
                            payload.manifest_status ||
                            payload.manifest.status ||
                            "ready",
                    }));
                }
                if (Array.isArray(payload?.sections)) {
                    setLoadedTextSections((prev) => {
                        const next = { ...prev };
                        for (const row of payload.sections) {
                            next[row.section_index] = row;
                        }
                        return next;
                    });
                }
            } catch (error) {
                console.error("Reader text content failed", error);
            }
        },
        [book?.filename, book?.lid, isTextFormat],
    );

    const createBookmark = useCallback(async () => {
        if (!book?.filename || !currentLocationRef.current) return null;
        const snapshot = currentLocationRef.current;
        try {
            const response = await API.post(
                `/reader/books/${encodeURIComponent(book.filename)}/annotations`,
                {
                    lid: book.lid || "",
                    format: book.extension || "",
                    anchor: {
                        location: snapshot.location,
                        location_type: snapshot.locationType || "",
                        view_state: snapshot.viewState || {},
                        progress_percent: snapshot.progressPercent || 0,
                    },
                    title:
                        snapshot.pageLabel?.trim() ||
                        `Bookmark ${(annotations?.length || 0) + 1}`,
                    note: "",
                    color: "amber",
                    kind: "bookmark",
                    page_label: snapshot.pageLabel || "",
                    chapter_label: "",
                },
            );
            const created = response.data?.data as ReaderAnnotation;
            if (created) {
                setAnnotations((prev) => [...prev, created]);
                return created;
            }
            return null;
        } catch (error) {
            console.error("Create bookmark failed", error);
            notify({
                title: "Bookmark Failed",
                message: "Could not save the bookmark.",
                tone: "error",
            });
            return null;
        }
    }, [annotations?.length, book?.extension, book?.filename, book?.lid]);

    const updateAnnotation = useCallback(
        async (
            annotationId: string,
            patch: Partial<
                Pick<
                    ReaderAnnotation,
                    | "anchor"
                    | "quote_text"
                    | "title"
                    | "note"
                    | "color"
                    | "kind"
                    | "page_label"
                    | "chapter_label"
                >
            >,
        ) => {
            const existing = annotations.find(
                (annotation) => annotation.annotation_id === annotationId,
            );
            if (!existing) return;

            try {
                const response = await API.put(
                    `/reader/annotations/${annotationId}`,
                    {
                        anchor: patch.anchor || existing.anchor || {},
                        quote_text: patch.quote_text ?? existing.quote_text,
                        title: patch.title ?? existing.title,
                        note: patch.note ?? existing.note,
                        color: patch.color ?? existing.color,
                        kind: patch.kind ?? existing.kind,
                        page_label: patch.page_label ?? existing.page_label,
                        chapter_label:
                            patch.chapter_label ?? existing.chapter_label,
                    },
                );
                const updated = response.data?.data as ReaderAnnotation;
                if (updated) {
                    setAnnotations((prev) =>
                        prev.map((annotation) =>
                            annotation.annotation_id === updated.annotation_id
                                ? updated
                                : annotation,
                        ),
                    );
                }
            } catch (error) {
                console.error("Update annotation failed", error);
            }
        },
        [annotations],
    );

    const deleteAnnotation = useCallback(async (annotationId: string) => {
        try {
            await API.delete(`/reader/annotations/${annotationId}`);
            setAnnotations((prev) =>
                prev.filter(
                    (annotation) => annotation.annotation_id !== annotationId,
                ),
            );
        } catch (error) {
            console.error("Delete annotation failed", error);
        }
    }, []);

    const jumpToAnnotation = useCallback(
        (annotation: ReaderAnnotation) => {
            const anchor = annotation.anchor || {};
            const locationValue = toLocationValue(
                anchor.location ??
                    anchor.section_index ??
                    annotation.page_label,
            );
            setReaderLocation(locationValue);
            if (typeof anchor.section_index === "number") {
                setCurrentTextSection(anchor.section_index);
            } else if (typeof locationValue === "number" && isTextFormat) {
                setCurrentTextSection(locationValue);
            }
        },
        [isTextFormat],
    );

    useEffect(() => {
        clearPendingFlush();
        sessionDirtyRef.current = false;
        currentLocationRef.current = null;
        hasHydratedLocationRef.current = false;
        setManifest(null);
        setSession(null);
        setAnnotations([]);
        setReaderLocation(null);
        setCurrentTextSection(0);
        setLoadedTextSections({});

        if (!book?.filename) return;

        try {
            const cachedRaw = localStorage.getItem(getCacheKey(book.filename));
            if (cachedRaw) {
                const cached = JSON.parse(
                    cachedRaw,
                ) as Partial<ReaderBootstrapPayload>;
                if (cached.manifest) setManifest(cached.manifest);
                if (cached.session) setSession(cached.session);
                if (Array.isArray(cached.annotations))
                    setAnnotations(cached.annotations);
                const cachedLocation = toLocationValue(
                    cached.session?.last_location,
                );
                if (cachedLocation !== null) {
                    setReaderLocation(cachedLocation);
                    currentLocationRef.current = {
                        location: cachedLocation,
                        locationType: cached.session?.last_location_type || "",
                        progressPercent: cached.session?.progress_percent || 0,
                        pageLabel: cached.session?.last_page_label || "",
                        viewState: cached.session?.view_state || {},
                    };
                }
            }
        } catch {
            // Ignore corrupted cache.
        }

        if (book.initialReaderBootstrap) {
            const bootstrap = book.initialReaderBootstrap;
            setManifest(bootstrap.manifest || null);
            setSession(bootstrap.session || null);
            setAnnotations(
                Array.isArray(bootstrap.annotations)
                    ? bootstrap.annotations
                    : [],
            );
            const initialLocation = toLocationValue(
                bootstrap.session?.last_location,
            );
            if (initialLocation !== null) {
                setReaderLocation(initialLocation);
                currentLocationRef.current = {
                    location: initialLocation,
                    locationType: bootstrap.session?.last_location_type || "",
                    progressPercent: bootstrap.session?.progress_percent || 0,
                    pageLabel: bootstrap.session?.last_page_label || "",
                    viewState: bootstrap.session?.view_state || {},
                };
            }
            if (isTextFormat) {
                setCurrentTextSection(
                    Math.max(
                        0,
                        Number(
                            toLocationValue(bootstrap.session?.last_location) ||
                                0,
                        ),
                    ),
                );
            }
            persistLocalCache(bootstrap);
        }

        void refreshBootstrap();
    }, [
        book?.filename,
        book?.initialReaderBootstrap,
        clearPendingFlush,
        isTextFormat,
        persistLocalCache,
        refreshBootstrap,
    ]);

    useEffect(() => {
        if (!book?.filename || !manifest || manifest.status !== "building")
            return;
        if (bootstrapPollRef.current)
            window.clearInterval(bootstrapPollRef.current);
        bootstrapPollRef.current = window.setInterval(() => {
            void refreshBootstrap();
        }, 1500);
        return () => {
            if (bootstrapPollRef.current) {
                window.clearInterval(bootstrapPollRef.current);
                bootstrapPollRef.current = null;
            }
        };
    }, [book?.filename, manifest, refreshBootstrap]);

    useEffect(() => {
        if (!book?.filename) return;
        wsRef.current = new WebSocket(WS_URL);
        wsRef.current.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (
                    payload.type === "READER_MANIFEST_READY" &&
                    payload.filename === book.filename
                ) {
                    void refreshBootstrap();
                }
                if (
                    payload.type === "READER_SESSION_UPDATED" &&
                    payload.filename === book.filename &&
                    !sessionDirtyRef.current &&
                    payload.session
                ) {
                    setSession(payload.session);
                }
            } catch (error) {
                console.error("Reader websocket error", error);
            }
        };

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [book?.filename, refreshBootstrap]);

    useEffect(() => {
        if (!isTextFormat || !manifest?.section_index?.length) return;
        void loadTextSections(Math.max(0, currentTextSection - 1), 3);
        reportLocation({
            location: currentTextSection,
            locationType: "text_section",
            progressPercent:
                manifest.section_index.length > 0
                    ? ((currentTextSection + 1) /
                          manifest.section_index.length) *
                      100
                    : 0,
            pageLabel: `Section ${currentTextSection + 1}`,
            viewState: {},
        });
    }, [
        currentTextSection,
        isTextFormat,
        loadTextSections,
        manifest?.section_index?.length,
        reportLocation,
    ]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                void flushSession();
            }
        };

        const handleBeforeUnload = () => {
            void flushSession();
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            window.removeEventListener("beforeunload", handleBeforeUnload);
            void flushSession();
        };
    }, [flushSession]);

    return {
        isBootstrapping,
        manifest,
        session,
        annotations,
        readerLocation,
        currentTextSection,
        loadedTextSections,
        isTextFormat,
        reportLocation,
        flushSession,
        refreshBootstrap,
        setCurrentTextSection,
        loadTextSections,
        createBookmark,
        updateAnnotation,
        deleteAnnotation,
        jumpToAnnotation,
    };
}
