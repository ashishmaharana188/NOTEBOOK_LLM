import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

type RefreshHandler = (scopes: string[]) => void;

interface RefreshBusContextValue {
  publish: (scopes: string[]) => void;
  subscribe: (handler: RefreshHandler) => () => void;
}

const RefreshBusContext = createContext<RefreshBusContextValue | null>(null);

export function RefreshBusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const handlersRef = useRef(new Set<RefreshHandler>());
  const pendingScopesRef = useRef(new Set<string>());
  const flushTimeoutRef = useRef<number | null>(null);

  const flushPendingScopes = useCallback(() => {
    const pendingScopes = Array.from(pendingScopesRef.current);
    pendingScopesRef.current.clear();
    flushTimeoutRef.current = null;

    if (pendingScopes.length === 0) return;

    handlersRef.current.forEach((handler) => {
      try {
        handler(pendingScopes);
      } catch (error) {
        console.error("Refresh bus handler failed", error);
      }
    });
  }, []);

  const publish = useCallback((scopes: string[]) => {
    if (!Array.isArray(scopes) || scopes.length === 0) return;
    const normalizedScopes = Array.from(
      new Set(scopes.map((scope) => String(scope || "")).filter(Boolean)),
    );
    if (normalizedScopes.length === 0) return;

    normalizedScopes.forEach((scope) => pendingScopesRef.current.add(scope));
    if (flushTimeoutRef.current !== null) return;

    flushTimeoutRef.current = window.setTimeout(() => {
      flushPendingScopes();
    }, 0);
  }, [flushPendingScopes]);

  const subscribe = useCallback((handler: RefreshHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      publish,
      subscribe,
    }),
    [publish, subscribe],
  );

  return (
    <RefreshBusContext.Provider value={value}>
      {children}
    </RefreshBusContext.Provider>
  );
}

export function useRefreshBus() {
  const context = useContext(RefreshBusContext);
  if (!context) {
    throw new Error("useRefreshBus must be used within RefreshBusProvider");
  }
  return context;
}
