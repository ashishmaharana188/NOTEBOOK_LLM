import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

export type NotificationTone = "info" | "success" | "warning" | "error";

export interface NotificationInput {
  title?: string;
  message: string;
  tone?: NotificationTone;
  durationMs?: number;
  sticky?: boolean;
}

export interface ConfirmDialogInput {
  title?: string;
  message: string;
  tone?: Exclude<NotificationTone, "success">;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ToastNotification extends NotificationInput {
  id: string;
  tone: NotificationTone;
}

interface ConfirmRequest extends ConfirmDialogInput {
  id: string;
  tone: Exclude<NotificationTone, "success">;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (accepted: boolean) => void;
}

let notifyBridge: ((input: NotificationInput) => void) | null = null;
let confirmBridge: ((input: ConfirmDialogInput) => Promise<boolean>) | null =
  null;

const normalizeMessage = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {}
  }
  return String(value);
};

const inferToneFromMessage = (message: string): NotificationTone => {
  if (/error|failed|failure|unable|invalid|denied|forbidden/i.test(message)) {
    return "error";
  }
  if (/warning|caution|mixed|separately|careful/i.test(message)) {
    return "warning";
  }
  if (
    /success|complete|completed|saved|started|synced|uploaded|clean/i.test(
      message,
    )
  ) {
    return "success";
  }
  return "info";
};

const normalizeNotificationInput = (
  input: NotificationInput | string,
): NotificationInput => {
  if (typeof input === "string") {
    return {
      message: input,
      tone: inferToneFromMessage(input),
    };
  }

  return {
    ...input,
    message: normalizeMessage(input.message),
    tone: input.tone || inferToneFromMessage(input.message),
  };
};

const normalizeConfirmInput = (
  input: ConfirmDialogInput | string,
): ConfirmDialogInput => {
  if (typeof input === "string") {
    return {
      title: "Please Confirm",
      message: input,
      tone: "warning",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
    };
  }

  return {
    title: input.title || "Please Confirm",
    message: normalizeMessage(input.message),
    tone: input.tone || "warning",
    confirmLabel: input.confirmLabel || "Continue",
    cancelLabel: input.cancelLabel || "Cancel",
  };
};

export const notify = (input: NotificationInput | string) => {
  const normalized = normalizeNotificationInput(input);
  if (notifyBridge) {
    notifyBridge(normalized);
    return;
  }
  console.log(
    `[${normalized.tone?.toUpperCase() || "INFO"}] ${normalized.message}`,
  );
};

export const confirmAction = async (
  input: ConfirmDialogInput | string,
): Promise<boolean> => {
  const normalized = normalizeConfirmInput(input);
  if (confirmBridge) {
    return confirmBridge(normalized);
  }
  console.warn(
    `Confirmation requested before notification provider was ready: ${normalized.message}`,
  );
  return false;
};

const toneStyles: Record<
  NotificationTone,
  {
    icon: React.ComponentType<React.ComponentProps<"svg">>;
    container: string;
    iconClass: string;
    chip: string;
  }
> = {
  info: {
    icon: InformationCircleIcon,
    container: "bg-white border-slate-200 text-slate-800",
    iconClass: "text-sky-500",
    chip: "bg-sky-50 text-sky-700 border-sky-200",
  },
  success: {
    icon: CheckCircleIcon,
    container: "bg-white border-emerald-200 text-slate-800",
    iconClass: "text-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  warning: {
    icon: ExclamationTriangleIcon,
    container: "bg-white border-amber-200 text-slate-800",
    iconClass: "text-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
  },
  error: {
    icon: ExclamationCircleIcon,
    container: "bg-white border-rose-200 text-slate-800",
    iconClass: "text-rose-500",
    chip: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

export function AppNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ConfirmRequest | null>(
    null,
  );
  const confirmQueueRef = useRef<ConfirmRequest[]>([]);
  const activeConfirmRef = useRef<ConfirmRequest | null>(null);
  const timeoutMapRef = useRef<Record<string, number>>({});
  const toastCounterRef = useRef(0);
  const confirmCounterRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    const timeoutId = timeoutMapRef.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete timeoutMapRef.current[id];
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const enqueueToast = useCallback(
    (input: NotificationInput) => {
      const normalized = normalizeNotificationInput(input);
      toastCounterRef.current += 1;
      const toast: ToastNotification = {
        id: `toast_${Date.now()}_${toastCounterRef.current}`,
        durationMs: 4600,
        sticky: false,
        ...normalized,
        tone: normalized.tone || "info",
      };

      setToasts((prev) => [toast, ...prev].slice(0, 5));

      if (!toast.sticky) {
        timeoutMapRef.current[toast.id] = window.setTimeout(() => {
          dismissToast(toast.id);
        }, toast.durationMs || 4600);
      }
    },
    [dismissToast],
  );

  const advanceConfirmQueue = useCallback(() => {
    const next = confirmQueueRef.current.shift() || null;
    activeConfirmRef.current = next;
    setActiveConfirm(next);
  }, []);

  const resolveConfirm = useCallback(
    (accepted: boolean) => {
      const current = activeConfirmRef.current;
      if (!current) return;
      current.resolve(accepted);
      advanceConfirmQueue();
    },
    [advanceConfirmQueue],
  );

  const openConfirm = useCallback((input: ConfirmDialogInput) => {
    const normalized = normalizeConfirmInput(input);

    return new Promise<boolean>((resolve) => {
      confirmCounterRef.current += 1;
      const request: ConfirmRequest = {
        id: `confirm_${Date.now()}_${confirmCounterRef.current}`,
        title: normalized.title || "Please Confirm",
        message: normalized.message,
        tone: normalized.tone || "warning",
        confirmLabel: normalized.confirmLabel || "Continue",
        cancelLabel: normalized.cancelLabel || "Cancel",
        resolve,
      };

      if (activeConfirmRef.current) {
        confirmQueueRef.current.push(request);
        return;
      }

      activeConfirmRef.current = request;
      setActiveConfirm(request);
    });
  }, []);

  useEffect(() => {
    const originalAlert = window.alert.bind(window);

    notifyBridge = enqueueToast;
    confirmBridge = openConfirm;
    window.alert = ((message?: unknown) => {
      enqueueToast(normalizeNotificationInput(normalizeMessage(message)));
    }) as typeof window.alert;

    return () => {
      notifyBridge = null;
      confirmBridge = null;
      window.alert = originalAlert;

      Object.values(timeoutMapRef.current).forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      timeoutMapRef.current = {};

      if (activeConfirmRef.current) {
        activeConfirmRef.current.resolve(false);
      }
      confirmQueueRef.current.forEach((request) => request.resolve(false));
      confirmQueueRef.current = [];
    };
  }, [enqueueToast, openConfirm]);

  const confirmTone = activeConfirm?.tone || "warning";
  const confirmStyle = toneStyles[confirmTone];
  const ConfirmIcon = confirmStyle.icon;

  return (
    <>
      {children}

      <div className="pointer-events-none fixed right-5 top-5 z-[300000] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map((toast) => {
            const style = toneStyles[toast.tone];
            const ToastIcon = style.icon;

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 18, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                className={`pointer-events-auto w-[360px] rounded-2xl border shadow-[0_24px_60px_rgba(15,23,42,0.18)] ${style.container}`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${style.chip}`}
                    >
                      <ToastIcon className={`h-5 w-5 ${style.iconClass}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                            {toast.title || `${toast.tone} notice`}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">
                            {toast.message}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => dismissToast(toast.id)}
                          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {activeConfirm && (
          <motion.div
            key={activeConfirm.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300100] flex items-center justify-center bg-slate-950/35 px-4  -[2px]"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_32px_80px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${confirmStyle.chip}`}
                >
                  <ConfirmIcon
                    className={`h-6 w-6 ${confirmStyle.iconClass}`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    {activeConfirm.title}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-800">
                    {activeConfirm.message}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => resolveConfirm(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {activeConfirm.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => resolveConfirm(true)}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 ${
                    confirmTone === "error"
                      ? "bg-rose-600"
                      : confirmTone === "warning"
                        ? "bg-amber-500"
                        : "bg-slate-900"
                  }`}
                >
                  {activeConfirm.confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
