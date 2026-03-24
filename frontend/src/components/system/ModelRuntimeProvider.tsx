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
import { confirmAction, notify } from "./AppNotifications";
import { API_BASE_URL, BACKEND_WS_URL } from "../../lib/runtimeConfig";

const API = axios.create({
    baseURL: API_BASE_URL,
});

type RuntimeRole = "embedding" | "reasoning";

interface RuntimeContextValue {
    runtime: any;
    loading: boolean;
    refreshing: boolean;
    refreshRuntime: () => Promise<any>;
    saveConfig: (updates: Record<string, any>) => Promise<any>;
    connectOllama: () => Promise<any>;
    startOllama: () => Promise<any>;
    stopOllama: () => Promise<any>;
    loadRoles: (
        roles: RuntimeRole[],
        allowStartManaged?: boolean,
    ) => Promise<any>;
    unloadRoles: (roles: RuntimeRole[]) => Promise<any>;
    ensureRolesThen: <T>(
        roles: RuntimeRole[],
        actionFn: () => Promise<T>,
        options?: { promptTitle?: string; promptMessage?: string },
    ) => Promise<T | null>;
    isRoleReady: (role: RuntimeRole) => boolean;
}

const ModelRuntimeContext = createContext<RuntimeContextValue | null>(null);

const extractPayload = (error: any) =>
    error?.response?.data?.detail || error?.response?.data || null;

const isModelLoadRequired = (error: any) => {
    const payload = extractPayload(error);
    return payload?.code === "MODEL_LOAD_REQUIRED";
};

const getRuntimeData = (response: any) =>
    response?.data?.data || response?.data || null;

const roleLabel = (role: RuntimeRole) =>
    role === "embedding" ? "Embedding Model" : "Reasoning Model";

export function ModelRuntimeProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [runtime, setRuntime] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);

    const refreshRuntime = useCallback(async () => {
        setRefreshing(true);
        try {
            const res = await API.get("/system/runtime");
            const data = getRuntimeData(res);
            setRuntime(data);
            return data;
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refreshRuntime();
        socketRef.current = new WebSocket(BACKEND_WS_URL);
        socketRef.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (
                    data.type === "runtime_status" ||
                    data.type === "model_loaded" ||
                    data.type === "model_unloaded"
                ) {
                    if (data.data) setRuntime(data.data);
                    else refreshRuntime();
                } else if (data.type === "runtime_error") {
                    notify({
                        title: "Runtime Error",
                        message:
                            data.message || "Model runtime operation failed.",
                        tone: "error",
                    });
                }
            } catch (error) {
                console.error(
                    "Failed to parse runtime websocket message",
                    error,
                );
            }
        };

        return () => {
            if (socketRef.current) socketRef.current.close();
        };
    }, [refreshRuntime]);

    const isRoleReady = useCallback(
        (role: RuntimeRole) => Boolean(runtime?.roles?.[role]?.loaded),
        [runtime],
    );

    const isRolePrepared = useCallback(
        (role: RuntimeRole) =>
            Boolean(
                runtime?.roles?.[role]?.enabled ||
                runtime?.roles?.[role]?.loaded,
            ),
        [runtime],
    );

    const runRuntimeAction = useCallback(
        async (
            request: Promise<any>,
            successTitle: string,
            failureTitle: string,
            successMessage?: string,
        ) => {
            try {
                const res = await request;
                const data = getRuntimeData(res);
                setRuntime(data);
                if (successMessage) {
                    notify({
                        title: successTitle,
                        message: successMessage,
                        tone: "success",
                    });
                }
                return data;
            } catch (error: any) {
                const payload = extractPayload(error);
                notify({
                    title: failureTitle,
                    message:
                        payload?.message ||
                        error?.message ||
                        "Operation failed.",
                    tone: "error",
                });
                throw error;
            }
        },
        [],
    );

    const saveConfig = useCallback(
        async (updates: Record<string, any>) =>
            runRuntimeAction(
                API.put("/system/runtime/config", updates),
                "System Config Saved",
                "System Config Failed",
            ),
        [runRuntimeAction],
    );

    const connectOllama = useCallback(
        async () =>
            runRuntimeAction(
                API.post("/system/ollama/connect"),
                "Ollama Connected",
                "Ollama Connection Failed",
                "Connected to the configured Ollama endpoint.",
            ),
        [runRuntimeAction],
    );

    const startOllama = useCallback(
        async () =>
            runRuntimeAction(
                API.post("/system/ollama/start"),
                "Ollama Started",
                "Ollama Start Failed",
                "Managed Ollama service started.",
            ),
        [runRuntimeAction],
    );

    const stopOllama = useCallback(
        async () =>
            runRuntimeAction(
                API.post("/system/ollama/stop"),
                "Ollama Stopped",
                "Ollama Stop Failed",
                "Managed Ollama service stopped.",
            ),
        [runRuntimeAction],
    );

    const loadRoles = useCallback(
        async (roles: RuntimeRole[], allowStartManaged = true) =>
            runRuntimeAction(
                API.post("/system/models/load", {
                    roles,
                    allow_start_managed: allowStartManaged,
                }),
                "Models Loaded",
                "Model Load Failed",
                roles.map(roleLabel).join(" + ") + " loaded.",
            ),
        [runRuntimeAction],
    );

    const ensureRoles = useCallback(
        async (roles: RuntimeRole[], allowStartManaged = true) =>
            runRuntimeAction(
                API.post("/system/models/ensure", {
                    roles,
                    allow_start_managed: allowStartManaged,
                }),
                "Runtime Prepared",
                "Runtime Prepare Failed",
            ),
        [runRuntimeAction],
    );

    const unloadRoles = useCallback(
        async (roles: RuntimeRole[]) =>
            runRuntimeAction(
                API.post("/system/models/unload", {
                    roles,
                    allow_start_managed: false,
                }),
                "Models Unloaded",
                "Model Unload Failed",
                roles.map(roleLabel).join(" + ") + " unloaded.",
            ),
        [runRuntimeAction],
    );

    const ensureRolesThen = useCallback(
        async <T,>(
            roles: RuntimeRole[],
            actionFn: () => Promise<T>,
            options?: { promptTitle?: string; promptMessage?: string },
        ): Promise<T | null> => {
            const uniqueRoles = Array.from(new Set(roles));
            const missing = uniqueRoles.filter((role) => !isRolePrepared(role));

            if (missing.length > 0) {
                const confirmed = await confirmAction({
                    title: options?.promptTitle || "Load Models",
                    message:
                        options?.promptMessage ||
                        `This action needs ${missing.map(roleLabel).join(" and ")} loaded. Load and continue?`,
                    tone: "warning",
                    confirmLabel: "Load & Continue",
                    cancelLabel: "Cancel",
                });
                if (!confirmed) return null;

                try {
                    await ensureRoles(uniqueRoles, true);
                } catch {
                    return null;
                }
            }

            try {
                return await actionFn();
            } catch (error: any) {
                if (isModelLoadRequired(error)) {
                    const payload = extractPayload(error);
                    const requiredRoles = (payload?.required_roles ||
                        uniqueRoles) as RuntimeRole[];
                    const confirmed = await confirmAction({
                        title: options?.promptTitle || "Load Models",
                        message:
                            payload?.message ||
                            options?.promptMessage ||
                            `This action needs ${requiredRoles.map(roleLabel).join(" and ")} loaded. Load and continue?`,
                        tone: "warning",
                        confirmLabel: "Load & Continue",
                        cancelLabel: "Cancel",
                    });
                    if (!confirmed) return null;

                    try {
                        await ensureRoles(requiredRoles, true);
                        return await actionFn();
                    } catch {
                        return null;
                    }
                }

                throw error;
            }
        },
        [ensureRoles, isRolePrepared],
    );

    const value = useMemo<RuntimeContextValue>(
        () => ({
            runtime,
            loading,
            refreshing,
            refreshRuntime,
            saveConfig,
            connectOllama,
            startOllama,
            stopOllama,
            loadRoles,
            unloadRoles,
            ensureRolesThen,
            isRoleReady,
        }),
        [
            runtime,
            loading,
            refreshing,
            refreshRuntime,
            saveConfig,
            connectOllama,
            startOllama,
            stopOllama,
            loadRoles,
            unloadRoles,
            ensureRolesThen,
            isRoleReady,
        ],
    );

    return (
        <ModelRuntimeContext.Provider value={value}>
            {children}
        </ModelRuntimeContext.Provider>
    );
}

export function useModelRuntime() {
    const context = useContext(ModelRuntimeContext);
    if (!context) {
        throw new Error(
            "useModelRuntime must be used within a ModelRuntimeProvider",
        );
    }
    return context;
}
