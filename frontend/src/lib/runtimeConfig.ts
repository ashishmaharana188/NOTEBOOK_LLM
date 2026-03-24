const DEFAULT_API_BASE_URL = "https://doomprompting123-space.hf.space";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const normalizePath = (value: string) =>
    value.startsWith("/") ? value : `/${value}`;

export const API_BASE_URL = trimTrailingSlash(
    import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
);

export const buildApiUrl = (path: string) =>
    `${API_BASE_URL}${normalizePath(path)}`;

const apiUrl = new URL(API_BASE_URL);
const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
const wsPath = normalizePath(import.meta.env.VITE_WS_PATH || "/ws");
const explicitWsUrl = import.meta.env.VITE_WS_URL;

export const BACKEND_WS_URL = explicitWsUrl
    ? explicitWsUrl
    : `${wsProtocol}//${apiUrl.host}${wsPath}`;
