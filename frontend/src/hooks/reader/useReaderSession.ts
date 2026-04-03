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
import { API_BASE_URL, BACKEND_WS_URL } from "../../lib/runtimeConfig";

const API = axios.create({
    baseURL: API_BASE_URL,
});
const LOCAL_CACHE_PREFIX = "reader_bootstrap_v4:";
const BOOTSTRAP_DEDUPE_WINDOW_MS = 15000;
const bootstrapMemoryCache = new Map<
    string,
    {
        payload: ReaderBootstrapPayload | null;
        signature: string;
        fetchedAt: number;
    }
>();

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

function getBootstrapIdentity(book: ReaderBook | null) {
    if (!book?.filename) return "";
    return [
        book.filename,
        book.lid || "",
        book.file_fingerprint || "",
    ].join("::");
}

function stableStringify(value: unknown) {
    try {
        return JSON.stringify(value ?? {});
    } catch {
        return "{}";
    }
}

function resolveInitialSectionIndex(sessionLike: {
    last_location?: unknown;
    last_location_type?: unknown;
    view_state?: Record<string, any> | null;
} | null | undefined) {
    const explicitSection = Number(sessionLike?.view_state?.sectionIndex);
    if (Number.isFinite(explicitSection) && explicitSection >= 0) {
        return explicitSection;
    }

    const legacySection = Number(sessionLike?.view_state?.section_index);
    if (Number.isFinite(legacySection) && legacySection >= 0) {
        return legacySection;
    }

    const rawLocation = toLocationValue(sessionLike?.last_location);
    const locationType = String(sessionLike?.last_location_type || "").trim().toLowerCase();
    if (
        typeof rawLocation === "number" &&
        Number.isFinite(rawLocation) &&
        rawLocation >= 0 &&
        locationType === "text_section"
    ) {
        return rawLocation;
    }

    return 0;
}

function isSameLocationPayload(
    left: ReaderLocationPayload | null,
    right: ReaderLocationPayload | null,
) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return (
        String(left.location ?? "") === String(right.location ?? "") &&
        String(left.locationType ?? "") === String(right.locationType ?? "") &&
        Number(left.progressPercent ?? 0) === Number(right.progressPercent ?? 0) &&
        String(left.pageLabel ?? "") === String(right.pageLabel ?? "") &&
        stableStringify(left.viewState) === stableStringify(right.viewState)
    );
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
    const lastLoadedSectionRef = useRef<number | null>(null);
    const currentLocationRef = useRef<ReaderLocationPayload | null>(null);
    const hasHydratedLocationRef = useRef(false);
    const hasHydratedSectionRef = useRef(false);
    const sessionDirtyRef = useRef(false);
    const sessionRef = useRef<ReaderSession | null>(null);
    const bootstrapIdentityRef = useRef("");
    const bootstrapRequestRef = useRef<Promise<ReaderBootstrapPayload | null> | null>(null);
    const latestBootstrapRef = useRef("");
    const manifestRef = useRef<ReaderManifestSummary | null>(null);

    const normalizedExtension = useMemo(() => {
        return String(book?.extension || "")
            .toLowerCase()
            .replace(/^\./, "");
    }, [book?.extension]);
    const isTextFormat = useMemo(() => {
        return normalizedExtension === "txt" || normalizedExtension === "md";
    }, [normalizedExtension]);
    const usesSectionReader = isTextFormat;
    const bootstrapIdentity = useMemo(
        () => getBootstrapIdentity(book),
        [book?.filename, book?.lid, book?.file_fingerprint],
    );

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    useEffect(() => {
        manifestRef.current = manifest;
    }, [manifest]);

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

    const hydrateFromBootstrap = useCallback(
        (
            payload: ReaderBootstrapPayload,
            options?: { hydrateLocation?: boolean; hydrateSection?: boolean },
        ) => {
            const hydrateLocation = options?.hydrateLocation ?? false;
            const hydrateSection = options?.hydrateSection ?? false;

            const payloadSignature = stableStringify({
                manifest: payload.manifest || null,
                session: payload.session || null,
                annotations: Array.isArray(payload.annotations)
                    ? payload.annotations
                    : [],
            });

            latestBootstrapRef.current = payloadSignature;
            bootstrapMemoryCache.set(bootstrapIdentity, {
                payload,
                signature: payloadSignature,
                fetchedAt: Date.now(),
            });

            setManifest(payload.manifest || null);
            setSession(payload.session || null);
            setAnnotations(
                Array.isArray(payload.annotations) ? payload.annotations : [],
            );

            const lastLocation = toLocationValue(payload.session?.last_location);
            if (hydrateLocation && !hasHydratedLocationRef.current) {
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
                              pageLabel:
                                  payload.session?.last_page_label || "",
                              viewState: payload.session?.view_state || {},
                          }
                        : null;
            }

            if (
                usesSectionReader &&
                hydrateSection &&
                !hasHydratedSectionRef.current
            ) {
                setCurrentTextSection(resolveInitialSectionIndex(payload.session));
                hasHydratedSectionRef.current = true;
            }

            persistLocalCache(payload);
        },
        [bootstrapIdentity, persistLocalCache, usesSectionReader],
    );

    const refreshBootstrap = useCallback(async (options?: { force?: boolean }) => {
        if (!book?.filename || !bootstrapIdentity) return null;
        if (bootstrapRequestRef.current) {
            return bootstrapRequestRef.current;
        }
        const cached = bootstrapMemoryCache.get(bootstrapIdentity);
        if (
            !options?.force &&
            cached?.payload &&
            Date.now() - cached.fetchedAt < BOOTSTRAP_DEDUPE_WINDOW_MS
        ) {
            if (cached.signature !== latestBootstrapRef.current) {
                hydrateFromBootstrap(cached.payload, {
                    hydrateLocation: !hasHydratedLocationRef.current,
                    hydrateSection: !hasHydratedSectionRef.current,
                });
            }
            return cached.payload;
        }
        const request = (async () => {
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

                const payloadSignature = stableStringify({
                    manifest: payload.manifest || null,
                    session: payload.session || null,
                    annotations: Array.isArray(payload.annotations)
                        ? payload.annotations
                        : [],
                });

                bootstrapMemoryCache.set(bootstrapIdentity, {
                    payload,
                    signature: payloadSignature,
                    fetchedAt: Date.now(),
                });
                if (payloadSignature !== latestBootstrapRef.current) {
                    hydrateFromBootstrap(payload, {
                        hydrateLocation: !hasHydratedLocationRef.current,
                        hydrateSection: !hasHydratedSectionRef.current,
                    });
                }
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
                bootstrapRequestRef.current = null;
                setIsBootstrapping(false);
            }
        })();
        bootstrapRequestRef.current = request;
        return request;
    }, [
        book?.filename,
        book?.lid,
        bootstrapIdentity,
        hydrateFromBootstrap,
    ]);

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
            if (isSameLocationPayload(currentLocationRef.current, payload)) {
                return;
            }
            currentLocationRef.current = payload;
            sessionDirtyRef.current = true;
            persistLocalCache({
                session: {
                    ...(sessionRef.current || ({} as ReaderSession)),
                    last_location: String(payload.location),
                    last_location_type: payload.locationType || "",
                    progress_percent: payload.progressPercent || 0,
                    last_page_label: payload.pageLabel || "",
                    view_state: payload.viewState || {},
                },
            });
            scheduleSessionFlush();
        },
        [persistLocalCache, scheduleSessionFlush],
    );

    const loadTextSections = useCallback(
        async (sectionIndex: number, limit = 1) => {
            if (!book?.filename || !usesSectionReader) return;
            try {
                const params: Record<string, string | number> = {
                    section: sectionIndex,
                    limit,
                };
                if (book.lid) {
                    params.lid = book.lid;
                }
                const response = await API.get(
                    `/reader/books/${encodeURIComponent(book.filename)}/content`,
                    {
                        params,
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
                    setLoadedTextSections(() => {
                        const next: Record<number, ReaderManifestSection> = {};
                        for (const row of payload.sections) {
                            next[row.section_index] = row;
                        }
                        return next;
                    });
                    if (
                        payload.sections.length > 0 &&
                        !payload.sections.some(
                            (row: ReaderManifestSection) =>
                                row.section_index === sectionIndex,
                        )
                    ) {
                        setCurrentTextSection(payload.sections[0].section_index);
                    }
                }
            } catch (error) {
                console.error("Reader text content failed", error);
            }
        },
        [book?.filename, book?.lid, usesSectionReader],
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

    const createAnnotation = useCallback(
        async (
            payload: Pick<
                ReaderAnnotation,
                | "anchor"
                | "quote_text"
                | "title"
                | "note"
                | "color"
                | "kind"
                | "page_label"
                | "chapter_label"
            >,
        ) => {
            if (!book?.filename) return null;
            try {
                const response = await API.post(
                    `/reader/books/${encodeURIComponent(book.filename)}/annotations`,
                    {
                        lid: book.lid || "",
                        format: book.extension || "",
                        anchor: payload.anchor || {},
                        quote_text: payload.quote_text || "",
                        title: payload.title || "",
                        note: payload.note || "",
                        color: payload.color || "amber",
                        kind: payload.kind || "highlight",
                        page_label: payload.page_label || "",
                        chapter_label: payload.chapter_label || "",
                    },
                );
                const created = response.data?.data as ReaderAnnotation;
                if (created) {
                    setAnnotations((prev) => [...prev, created]);
                    return created;
                }
            } catch (error) {
                console.error("Create annotation failed", error);
            }
            return null;
        },
        [book?.extension, book?.filename, book?.lid],
    );

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
            } else if (typeof locationValue === "number" && usesSectionReader) {
                setCurrentTextSection(locationValue);
            }
        },
        [usesSectionReader],
    );

    useEffect(() => {
        if (bootstrapIdentityRef.current === bootstrapIdentity) {
            return;
        }
        bootstrapIdentityRef.current = bootstrapIdentity;
        latestBootstrapRef.current = "";
        bootstrapRequestRef.current = null;
        clearPendingFlush();
        sessionDirtyRef.current = false;
        currentLocationRef.current = null;
        lastLoadedSectionRef.current = null;
        hasHydratedLocationRef.current = false;
        hasHydratedSectionRef.current = false;
        if (bootstrapPollRef.current) {
            window.clearInterval(bootstrapPollRef.current);
            bootstrapPollRef.current = null;
        }
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
                if (usesSectionReader) {
                    setCurrentTextSection(resolveInitialSectionIndex(cached.session));
                }
            }
        } catch {
            // Ignore corrupted cache.
        }

        const initialBootstrap = book.initialReaderBootstrap;
        if (initialBootstrap) {
            const bootstrap = initialBootstrap;
            hydrateFromBootstrap(bootstrap, {
                hydrateLocation: true,
                hydrateSection: true,
            });
        }

        const shouldBootstrapFromNetwork =
            !initialBootstrap ||
            usesSectionReader ||
            String(initialBootstrap?.manifest?.status || "").toLowerCase() ===
                "building";

        if (shouldBootstrapFromNetwork) {
            void refreshBootstrap();
        }
    }, [
        bootstrapIdentity,
        book?.filename,
        clearPendingFlush,
        persistLocalCache,
        refreshBootstrap,
        usesSectionReader,
    ]);

    useEffect(() => {
        if (
            !usesSectionReader ||
            !book?.filename ||
            !manifest ||
            manifest.status !== "building"
        )
            return;
        if (bootstrapPollRef.current)
            window.clearInterval(bootstrapPollRef.current);
        bootstrapPollRef.current = window.setInterval(() => {
            void refreshBootstrap({ force: true });
        }, 1500);
        return () => {
            if (bootstrapPollRef.current) {
                window.clearInterval(bootstrapPollRef.current);
                bootstrapPollRef.current = null;
            }
        };
    }, [book?.filename, manifest, refreshBootstrap, usesSectionReader]);

    useEffect(() => {
        if (!usesSectionReader) return;
        const sectionCount = manifest?.section_index?.length || 0;
        if (!sectionCount) {
            if (currentTextSection !== 0) {
                setCurrentTextSection(0);
            }
            return;
        }
        const maxSectionIndex = sectionCount - 1;
        if (currentTextSection > maxSectionIndex) {
            setCurrentTextSection(maxSectionIndex);
        }
    }, [currentTextSection, manifest?.section_index?.length, usesSectionReader]);

    useEffect(() => {
        if (!book?.filename) return;
        wsRef.current = new WebSocket(BACKEND_WS_URL);
        wsRef.current.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (
                    payload.type === "READER_MANIFEST_READY" &&
                    payload.filename === book.filename
                ) {
                    const activeManifestStatus = String(
                        manifestRef.current?.status || "",
                    ).toLowerCase();
                    const waitingForBuild =
                        activeManifestStatus === "building" ||
                        !latestBootstrapRef.current;
                    const payloadLid = String(payload.lid || "");
                    const activeLid = String(book.lid || "");
                    if (
                        waitingForBuild &&
                        payloadLid === activeLid
                    ) {
                        void refreshBootstrap({ force: true });
                    }
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
        if (!usesSectionReader || !book?.filename) return;
        if (lastLoadedSectionRef.current !== currentTextSection) {
            lastLoadedSectionRef.current = currentTextSection;
            setLoadedTextSections((prev) =>
                prev[currentTextSection]
                    ? { [currentTextSection]: prev[currentTextSection] }
                    : {},
            );
        }
        void loadTextSections(currentTextSection, 1);
    }, [
        book?.filename,
        currentTextSection,
        loadTextSections,
        manifest?.status,
        usesSectionReader,
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
        usesSectionReader,
        reportLocation,
        flushSession,
        refreshBootstrap,
        setCurrentTextSection,
        loadTextSections,
        createBookmark,
        createAnnotation,
        updateAnnotation,
        deleteAnnotation,
        jumpToAnnotation,
    };
}
