import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  BoltIcon,
  CpuChipIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { useModelRuntime } from "../../system/ModelRuntimeProvider";

const roleTitles = {
  embedding: "Embedding Model",
  reasoning: "Reasoning Model",
} as const;

export default function SystemConfigPanel() {
  const {
    runtime,
    loading,
    refreshing,
    saveConfig,
    connectOllama,
    startOllama,
    stopOllama,
    loadRoles,
    unloadRoles,
  } = useModelRuntime();

  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (runtime?.config) setDraft(runtime.config);
  }, [runtime]);

  const memory = runtime?.memory || {};
  const preflight = runtime?.preflight;
  const catalog = runtime?.catalog || {};
  const service = runtime?.service || {};
  const policy = runtime?.policy || {};

  const profileOptions = useMemo(
    () => ({
      embedding: Object.entries(catalog.embedding || {}),
      reasoning: Object.entries(catalog.reasoning || {}),
    }),
    [catalog],
  );

  if (loading || !draft) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-slate-600 text-sm font-semibold">
          <ArrowPathIcon className="w-5 h-5 animate-spin" />
          Loading system runtime...
        </div>
      </div>
    );
  }

  const persist = async (updates: Record<string, any>) => {
    const next = { ...draft, ...updates };
    setDraft(next);
    await saveConfig(updates);
  };

  const statusPill =
    service.state === "running_managed"
      ? "bg-emerald-100 text-emerald-700"
      : service.state === "connected_external"
        ? "bg-sky-100 text-sky-700"
        : service.state === "error"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-600";

  return (
    <div className="h-full overflow-y-auto bg-[#eef2f7] p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[28px] mt-15 border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${statusPill}`}
              >
                {service.state || "unknown"}
              </span>
              <button
                type="button"
                onClick={() => connectOllama()}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => startOllama()}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Start Service
              </button>
              <button
                type="button"
                onClick={() => stopOllama()}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
              >
                Stop Managed
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
            <label className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Ollama Endpoint
            </label>
            <input
              type="text"
              value={draft.ollama_endpoint}
              onChange={(e) =>
                setDraft({ ...draft, ollama_endpoint: e.target.value })
              }
              onBlur={() => persist({ ollama_endpoint: draft.ollama_endpoint })}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
            />
            {refreshing && (
              <span className="ml-3 text-slate-400">Refreshing...</span>
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            {(["embedding", "reasoning"] as const).map((role) => {
              const state = runtime?.roles?.[role] || {};
              const timeoutKey = `${role}_timeout_minutes`;
              const profileKey = `${role}_profile`;
              const precisionKey = `${role}_precision`;

              return (
                <div
                  key={role}
                  className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                          {role === "embedding" ? (
                            <CpuChipIcon className="h-6 w-6" />
                          ) : (
                            <BoltIcon className="h-6 w-6" />
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                            {role}
                          </p>
                          <h3 className="text-xl font-black text-slate-900">
                            {roleTitles[role]}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${
                        state.loaded
                          ? "bg-emerald-100 text-emerald-700"
                          : state.enabled
                            ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {state.loaded ? "active" : state.enabled ? "standby" : "unloaded"}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-bold text-slate-700">
                      Profile
                      <select
                        value={draft[profileKey]}
                        onChange={(e) =>
                          persist({ [profileKey]: e.target.value })
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
                      >
                        {profileOptions[role].map(([id, meta]: any) => (
                          <option key={id} value={id}>
                            {meta.label || id}
                          </option>
                        ))}
                      </select>
                    </label>

                    {role === "embedding" ? (
                      <label className="text-sm font-bold text-slate-700">
                        Precision
                        <select
                          value={draft[precisionKey] || "fp32"}
                          onChange={(e) =>
                            persist({ [precisionKey]: e.target.value })
                          }
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
                        >
                          <option value="fp32">FP32 (Full Precision)</option>
                          <option value="bf16">BF16 (Fast, Near-Full Precision)</option>
                          <option value="fp16">FP16 (Fastest, Slight Loss)</option>
                        </select>
                      </label>
                    ) : (
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                        <p className="font-black uppercase tracking-[0.18em] text-slate-400">
                          Runtime Policy
                        </p>
                        <p className="mt-2 font-semibold">
                          Reasoning is GPU-managed and will unload the embedding
                          runtime before activation.
                        </p>
                      </div>
                    )}

                    <label className="text-sm font-bold text-slate-700">
                      Auto-Unload Timeout (minutes)
                      <input
                        type="number"
                        min={0}
                        value={draft[timeoutKey]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [timeoutKey]: Math.max(
                              0,
                              Number(e.target.value || 0),
                            ),
                          })
                        }
                        onBlur={() =>
                          persist({
                            [timeoutKey]: Number(draft[timeoutKey] || 0),
                          })
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
                      />
                    </label>

                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-black uppercase tracking-[0.18em] text-slate-400">
                        Current Runtime
                      </p>
                      <p className="mt-2 font-semibold">
                        Profile:{" "}
                        <span className="font-black text-slate-900">
                          {state.profile || draft[profileKey]}
                        </span>
                      </p>
                      {role === "embedding" && (
                        <p className="mt-1 font-semibold">
                          Precision:{" "}
                          <span className="font-black text-slate-900">
                            {state.precision || draft[precisionKey] || "fp32"}
                          </span>
                        </p>
                      )}
                      <p className="mt-1 font-semibold">
                        Device:{" "}
                        <span className="font-black text-slate-900">
                          {state.device || "idle"}
                        </span>
                      </p>
                      <p className="mt-1 font-semibold">
                        Policy:{" "}
                        <span className="font-black text-slate-900">
                          CUDA only, single active GPU role
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => loadRoles([role], role === "reasoning")}
                      className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => unloadRoles([role])}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Unload
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <ServerStackIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                  Memory Readiness
                </p>
                <h3 className="text-xl font-black text-slate-900">
                  Projected Footprint
                </h3>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Available RAM
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {memory.available_ram_gb ?? "--"} GB
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Total: {memory.total_ram_gb ?? "--"} GB
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Available VRAM
                </p>
                <p className="mt-2 text-2xl font-black text-slate-900">
                  {memory.available_vram_gb ?? "--"} GB
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Total: {memory.total_vram_gb ?? "--"} GB
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Last Preflight
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-600">
                Projected RAM:{" "}
                <span className="font-black text-slate-900">
                  {preflight?.projected?.ram_gb ?? 0} GB
                </span>
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Projected VRAM:{" "}
                <span className="font-black text-slate-900">
                  {preflight?.projected?.vram_gb ?? 0} GB
                </span>
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {policy.single_gpu_mode
                  ? "The runtime keeps only one GPU role active at a time. Loading embeddings unloads reasoning, and loading reasoning unloads embeddings."
                  : "Projected memory is based on the current runtime catalog."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
