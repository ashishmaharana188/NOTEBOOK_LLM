import gc
import json
import logging
import os
import subprocess
import threading
import time
from typing import Any, Callable, Dict, Iterable, List, Optional

import requests
import torch
from sentence_transformers import SentenceTransformer

try:
    import psutil
except Exception:  # pragma: no cover - optional dependency fallback
    psutil = None

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONFIG_PATH = os.path.join(DATA_DIR, "system_runtime_config.json")
EMBEDDING_STORAGE_DIM = 1024

DEFAULT_CONFIG: Dict[str, Any] = {
    "ollama_endpoint": "http://localhost:11434",
    "embedding_profile": "all-minilm-l6-v2",
    "reasoning_profile": "qwen2.5:1.5b-instruct",
    "embedding_timeout_minutes": 0,
    "reasoning_timeout_minutes": 0,
    "embedding_placement": "cpu",
    "reasoning_placement": "cpu",
    "embedding_precision": "fp32",
    "embedding_low_memory_profile": "paraphrase-multilingual-minilm-l12-v2",
    "reasoning_low_memory_profile": "qwen2.5:0.5b-instruct",
}

MODEL_CATALOG: Dict[str, Dict[str, Dict[str, Any]]] = {
    "embedding": {
        "all-minilm-l6-v2": {
            "label": "All-MiniLM-L6-v2",
            "provider": "native",
            "model_id": "sentence-transformers/all-MiniLM-L6-v2",
            "embedding_dim": 384,
            "est_ram_gb": 0.35,
            "est_vram_gb_fp32": 0.22,
            "est_vram_gb_bf16": 0.16,
            "est_vram_gb_fp16": 0.14,
            "supports_fp16": False,
            "supports_bf16": False,
            "dual_vram_profile": "all-minilm-l6-v2",
        },
        "paraphrase-multilingual-minilm-l12-v2": {
            "label": "Paraphrase Multilingual MiniLM-L12-v2",
            "provider": "native",
            "model_id": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            "embedding_dim": 384,
            "est_ram_gb": 0.55,
            "est_vram_gb_fp32": 0.32,
            "est_vram_gb_bf16": 0.24,
            "est_vram_gb_fp16": 0.22,
            "supports_fp16": False,
            "supports_bf16": False,
            "dual_vram_profile": "all-minilm-l6-v2",
        },
    },
    "reasoning": {
        "qwen2.5:1.5b-instruct": {
            "label": "Qwen 2.5 1.5B Instruct",
            "provider": "ollama",
            "model_id": "qwen2.5:1.5b-instruct",
            "est_ram_gb": 2.4,
            "est_vram_gb": 1.1,
            "dual_vram_profile": "qwen2.5:0.5b-instruct",
        },
        "qwen2.5:0.5b-instruct": {
            "label": "Qwen 2.5 0.5B Instruct",
            "provider": "ollama",
            "model_id": "qwen2.5:0.5b-instruct",
            "est_ram_gb": 1.2,
            "est_vram_gb": 0.45,
            "dual_vram_profile": "qwen2.5:0.5b-instruct",
        },
    },
}


class RuntimeNotReadyError(RuntimeError):
    def __init__(
        self,
        required_roles: Iterable[str],
        missing_roles: Iterable[str],
        service_required: bool = False,
        message: Optional[str] = None,
    ):
        self.required_roles = list(required_roles)
        self.missing_roles = list(missing_roles)
        self.service_required = service_required
        super().__init__(
            message
            or "Required models are not enabled. Prepare them in System Configuration and retry."
        )

    def to_payload(self) -> Dict[str, Any]:
        return {
            "status": "error",
            "code": "MODEL_LOAD_REQUIRED",
            "required_roles": self.required_roles,
            "missing_roles": self.missing_roles,
            "service_required": self.service_required,
            "message": str(self),
            "can_retry": True,
        }


class RuntimeLoadError(RuntimeError):
    pass


class ModelRuntimeManager:
    def __init__(self):
        os.makedirs(DATA_DIR, exist_ok=True)
        self._lock = threading.RLock()
        self._embedding_execution_lock = threading.RLock()
        self._broadcast: Optional[Callable[[Dict[str, Any]], None]] = None
        self._embedding_model: Optional[SentenceTransformer] = None
        self._embedding_thread_id: Optional[int] = None
        self._managed_ollama_process: Optional[subprocess.Popen] = None
        self._stop_event = threading.Event()
        self._active_uses = {"embedding": 0, "reasoning": 0}
        self._config = self._load_config()
        self._role_state: Dict[str, Dict[str, Any]] = {
            "embedding": {
                "loaded": False,
                "enabled": False,
                "profile": self._config["embedding_profile"],
                "placement": self._config["embedding_placement"],
                "precision": self._config["embedding_precision"],
                "last_used_at": None,
                "loaded_at": None,
                "timeout_minutes": self._config["embedding_timeout_minutes"],
                "device": None,
            },
            "reasoning": {
                "loaded": False,
                "enabled": False,
                "profile": self._config["reasoning_profile"],
                "placement": self._config["reasoning_placement"],
                "last_used_at": None,
                "loaded_at": None,
                "timeout_minutes": self._config["reasoning_timeout_minutes"],
                "device": None,
            },
        }
        self._sweeper = threading.Thread(
            target=self._sweeper_loop,
            name="model-runtime-sweeper",
            daemon=True,
        )
        self._sweeper.start()

    def set_broadcaster(self, callback: Callable[[Dict[str, Any]], None]):
        self._broadcast = callback

    def _emit(self, message: Dict[str, Any]):
        if self._broadcast:
            try:
                self._broadcast(message)
            except Exception as error:  # pragma: no cover - best effort
                logger.warning(f"Runtime broadcast failed: {error}")

    def _load_config(self) -> Dict[str, Any]:
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
                    saved = json.load(handle)
                normalized = self._normalize_config({**DEFAULT_CONFIG, **saved})
                if normalized != saved:
                    self._write_config(normalized)
                return normalized
            except Exception as error:
                logger.warning(f"Failed to read runtime config: {error}")
        self._write_config(DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)

    def _write_config(self, payload: Dict[str, Any]):
        with open(CONFIG_PATH, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    def _normalize_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = {**DEFAULT_CONFIG, **payload}

        for role in ("embedding", "reasoning"):
            profile_key = f"{role}_profile"
            low_memory_key = f"{role}_low_memory_profile"
            if normalized.get(profile_key) not in MODEL_CATALOG[role]:
                normalized[profile_key] = DEFAULT_CONFIG[profile_key]
            if normalized.get(low_memory_key) not in MODEL_CATALOG[role]:
                normalized[low_memory_key] = DEFAULT_CONFIG.get(low_memory_key)

            placement_key = f"{role}_placement"
            placement = str(normalized.get(placement_key) or "cpu").lower()
            if placement in {"vram", "gpu"}:
                placement = "cuda"
            elif placement == "ram":
                placement = "cpu"
            elif placement == "auto":
                placement = "cuda" if torch.cuda.is_available() else "cpu"
            elif placement not in {"cpu", "cuda"}:
                placement = "cpu"

            if placement == "cuda" and not torch.cuda.is_available():
                placement = "cpu"
            normalized[placement_key] = placement

        precision = str(normalized.get("embedding_precision") or "fp32").lower()
        if precision not in {"fp32", "bf16", "fp16"}:
            precision = "fp32"
        if normalized.get("embedding_placement") != "cuda":
            precision = "fp32"
        normalized["embedding_precision"] = precision
        return normalized

    def update_config(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            next_config = self._normalize_config({**self._config, **updates})
            embedding_reconfigure = any(
                next_config[key] != self._config.get(key)
                for key in (
                    "embedding_profile",
                    "embedding_placement",
                    "embedding_precision",
                )
            )
            reasoning_reconfigure = any(
                next_config[key] != self._config.get(key)
                for key in ("reasoning_profile", "reasoning_placement")
            )

            self._config = next_config
            self._write_config(next_config)
            if embedding_reconfigure and self._role_state["embedding"]["loaded"]:
                self.unload_embedding_model(reason="config_update")
            if reasoning_reconfigure and self._role_state["reasoning"]["loaded"]:
                self.unload_reasoning_model(reason="config_update")
            self._role_state["embedding"]["profile"] = next_config["embedding_profile"]
            self._role_state["embedding"]["placement"] = next_config[
                "embedding_placement"
            ]
            self._role_state["embedding"]["precision"] = next_config[
                "embedding_precision"
            ]
            self._role_state["embedding"]["timeout_minutes"] = next_config[
                "embedding_timeout_minutes"
            ]
            self._role_state["reasoning"]["profile"] = next_config["reasoning_profile"]
            self._role_state["reasoning"]["placement"] = next_config[
                "reasoning_placement"
            ]
            self._role_state["reasoning"]["timeout_minutes"] = next_config[
                "reasoning_timeout_minutes"
            ]
            data = self.get_runtime_snapshot()
            self._emit({"type": "runtime_status", "data": data})
            return data

    def _get_ollama_root(self) -> str:
        return self._config.get("ollama_endpoint", "http://localhost:11434").rstrip("/")

    def _get_catalog_entry(self, role: str, profile: str) -> Dict[str, Any]:
        try:
            return MODEL_CATALOG[role][profile]
        except KeyError as error:
            raise RuntimeLoadError(f"Unknown {role} profile: {profile}") from error

    def _resolve_role_profile(self, role: str, dual_vram_mode: bool = False) -> str:
        profile = self._config[f"{role}_profile"]
        if dual_vram_mode:
            fallback = self._config.get(f"{role}_low_memory_profile")
            if fallback and fallback in MODEL_CATALOG[role]:
                return fallback
            mapped = self._get_catalog_entry(role, profile).get("dual_vram_profile")
            if mapped and mapped in MODEL_CATALOG[role]:
                return mapped
        return profile

    def _placement_to_device(self, role: str) -> str:
        placement = str(self._config.get(f"{role}_placement") or "cpu").lower()
        if placement == "cuda" and torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _ensure_cuda_available(self, roles: Iterable[str]):
        if any(self._placement_to_device(role) == "cuda" for role in roles) and not torch.cuda.is_available():
            raise RuntimeLoadError(
                "CUDA was requested for the active runtime profile, but no CUDA device is available."
            )

    def _memory_snapshot(self) -> Dict[str, Any]:
        total_ram_gb = available_ram_gb = None
        if psutil is not None:
            vm = psutil.virtual_memory()
            total_ram_gb = round(vm.total / (1024**3), 2)
            available_ram_gb = round(vm.available / (1024**3), 2)

        total_vram_gb = available_vram_gb = None
        if torch.cuda.is_available():
            try:
                free_vram, total_vram = torch.cuda.mem_get_info()
                total_vram_gb = round(total_vram / (1024**3), 2)
                available_vram_gb = round(free_vram / (1024**3), 2)
            except Exception:
                props = torch.cuda.get_device_properties(0)
                total_vram_gb = round(props.total_memory / (1024**3), 2)
                available_vram_gb = None

        return {
            "total_ram_gb": total_ram_gb,
            "available_ram_gb": available_ram_gb,
            "total_vram_gb": total_vram_gb,
            "available_vram_gb": available_vram_gb,
            "cuda_available": torch.cuda.is_available(),
        }

    def _estimate_load(self, profile: str, role: str, device: str) -> float:
        entry = self._get_catalog_entry(role, profile)
        if role == "embedding" and device == "cuda":
            precision = str(self._config.get("embedding_precision") or "fp32").lower()
            return float(
                entry.get(
                    f"est_vram_gb_{precision}", entry.get("est_vram_gb_fp32", 0.0)
                )
            )
        key = "est_vram_gb" if device == "cuda" else "est_ram_gb"
        return float(entry.get(key, 0.0))

    def _resolve_embedding_batch_size(
        self, requested_batch_size: Optional[int] = None
    ) -> int:
        if requested_batch_size and int(requested_batch_size) > 0:
            return int(requested_batch_size)

        device = self._role_state["embedding"].get("device") or self._placement_to_device(
            "embedding"
        )
        if device != "cuda":
            cpu_count = os.cpu_count() or 2
            return 12 if cpu_count >= 4 else 8

        precision = str(self._config.get("embedding_precision") or "fp32").lower()
        available_vram = self._memory_snapshot().get("available_vram_gb") or 0

        if precision == "fp16":
            return 64 if available_vram >= 8 else 48
        if precision == "bf16":
            return 48 if available_vram >= 8 else 32
        return 32

    def _preflight_roles(self, roles: Iterable[str]) -> Dict[str, Any]:
        unique_roles = sorted(set(roles))
        self._ensure_cuda_available(unique_roles)
        devices = {role: self._placement_to_device(role) for role in unique_roles}
        resolved_profiles = {
            role: self._resolve_role_profile(role, dual_vram_mode=False)
            for role in unique_roles
        }
        snapshot = self._memory_snapshot()

        ram_need = (
            max(
                self._estimate_load(resolved_profiles[role], role, devices[role])
                for role in unique_roles
                if devices[role] == "cpu"
            )
            if any(devices[role] == "cpu" for role in unique_roles)
            else 0.0
        )
        vram_need = (
            max(
                self._estimate_load(resolved_profiles[role], role, devices[role])
                for role in unique_roles
                if devices[role] == "cuda"
            )
            if any(devices[role] == "cuda" for role in unique_roles)
            else 0.0
        )

        ram_ok = (
            snapshot["available_ram_gb"] is None
            or ram_need <= snapshot["available_ram_gb"]
        )
        vram_ok = (
            snapshot["available_vram_gb"] is None
            or vram_need <= snapshot["available_vram_gb"]
        )

        if not ram_ok or not vram_ok:
            available_vram = snapshot.get("available_vram_gb")
            available_ram = snapshot.get("available_ram_gb")
            message = "The selected model profile does not fit in available memory. Choose a lighter profile."
            if not vram_ok:
                message += (
                    f" Estimated VRAM need: {round(vram_need, 2)} GB."
                    f" Available VRAM: {available_vram if available_vram is not None else 'unknown'} GB."
                )
            if not ram_ok:
                message += (
                    f" Estimated RAM need: {round(ram_need, 2)} GB."
                    f" Available RAM: {available_ram if available_ram is not None else 'unknown'} GB."
                )
            raise RuntimeLoadError(message)

        return {
            "roles": unique_roles,
            "devices": devices,
            "resolved_profiles": resolved_profiles,
            "memory": snapshot,
            "projected": {"ram_gb": round(ram_need, 2), "vram_gb": round(vram_need, 2)},
            "single_gpu_mode": any(device == "cuda" for device in devices.values()),
        }

    def _ollama_is_reachable(self) -> bool:
        try:
            response = requests.get(f"{self._get_ollama_root()}/api/tags", timeout=2)
            return response.status_code == 200
        except Exception:
            return False

    def connect_ollama(self) -> Dict[str, Any]:
        reachable = self._ollama_is_reachable()
        if not reachable:
            raise RuntimeLoadError(
                "Could not connect to Ollama at the configured endpoint."
            )
        self._emit({"type": "runtime_status", "data": self.get_runtime_snapshot()})
        return self.get_runtime_snapshot()

    def start_ollama(self) -> Dict[str, Any]:
        with self._lock:
            if (
                self._managed_ollama_process
                and self._managed_ollama_process.poll() is None
            ):
                return self.get_runtime_snapshot()

            try:
                self._managed_ollama_process = subprocess.Popen(
                    ["ollama", "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception as error:
                raise RuntimeLoadError(f"Failed to start Ollama: {error}") from error

        for _ in range(20):
            if self._ollama_is_reachable():
                data = self.get_runtime_snapshot()
                self._emit({"type": "runtime_status", "data": data})
                return data
            time.sleep(0.5)

        raise RuntimeLoadError(
            "Ollama was started but did not become reachable in time."
        )

    def stop_ollama(self) -> Dict[str, Any]:
        with self._lock:
            if self._role_state["reasoning"]["loaded"]:
                self.unload_reasoning_model(reason="service_stop")

            process = self._managed_ollama_process
            self._managed_ollama_process = None
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except Exception:
                    process.kill()
        data = self.get_runtime_snapshot()
        self._emit({"type": "runtime_status", "data": data})
        return data

    def _ollama_generate(
        self, payload: Dict[str, Any], timeout: int = 30
    ) -> Dict[str, Any]:
        response = requests.post(
            f"{self._get_ollama_root()}/api/generate",
            json=payload,
            timeout=timeout,
        )
        if response.status_code >= 400:
            detail = ""
            try:
                body = response.json()
                detail = body.get("error") or body.get("message") or json.dumps(body)
            except Exception:
                detail = response.text.strip()
            raise RuntimeLoadError(
                f"Ollama generate request failed ({response.status_code}): {detail or 'Unknown error'}"
            )
        return response.json()

    def _get_ollama_model_names(self) -> List[str]:
        response = requests.get(f"{self._get_ollama_root()}/api/tags", timeout=5)
        if response.status_code >= 400:
            raise RuntimeLoadError(
                f"Could not list Ollama models ({response.status_code})."
            )
        payload = response.json() or {}
        models = payload.get("models") or []
        names = []
        for model in models:
            name = model.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
        return names

    def _resolve_ollama_model_name(self, requested_model: str) -> str:
        names = self._get_ollama_model_names()
        if requested_model in names:
            return requested_model

        if ":" not in requested_model:
            latest_candidate = f"{requested_model}:latest"
            if latest_candidate in names:
                return latest_candidate

        prefix = requested_model if requested_model.endswith(":") else f"{requested_model}:"
        candidates = [name for name in names if name.startswith(prefix)]
        if candidates:
            latest = next((name for name in candidates if name.endswith(":latest")), None)
            return latest or sorted(candidates)[0]

        installed = ", ".join(names[:8]) if names else "none"
        raise RuntimeLoadError(
            f"Ollama model '{requested_model}' is not installed. Installed models: {installed}"
        )

    def _mark_role_loaded(self, role: str, profile: str, device: str):
        state = self._role_state[role]
        now = time.time()
        state.update(
            {
                "loaded": True,
                "enabled": True,
                "profile": profile,
                "device": device,
                "loaded_at": now,
                "last_used_at": now,
            }
        )
        self._emit(
            {
                "type": "model_loaded",
                "role": role,
                "profile": profile,
                "device": device,
                "data": self.get_runtime_snapshot(),
            }
        )

    def _mark_role_unloaded(self, role: str, reason: str):
        state = self._role_state[role]
        profile = state.get("profile")
        if reason in {"manual", "service_stop", "shutdown"}:
            state["enabled"] = False
        state.update({"loaded": False, "device": None, "loaded_at": None})
        self._emit(
            {
                "type": "model_unloaded",
                "role": role,
                "profile": profile,
                "reason": reason,
                "data": self.get_runtime_snapshot(),
            }
        )

    def _normalize_embedding_vector(self, vector: Any) -> List[float]:
        raw_values = vector.tolist() if hasattr(vector, "tolist") else list(vector)
        normalized_values = [float(value) for value in raw_values]
        if len(normalized_values) >= EMBEDDING_STORAGE_DIM:
            return normalized_values[:EMBEDDING_STORAGE_DIM]
        return normalized_values + [0.0] * (EMBEDDING_STORAGE_DIM - len(normalized_values))

    def load_embedding_model(
        self,
        profile: Optional[str] = None,
        device: Optional[str] = None,
        precision: Optional[str] = None,
    ):
        with self._lock:
            self._ensure_cuda_available(["embedding"])
            target_profile = profile or self._config["embedding_profile"]
            target_device = device or self._placement_to_device("embedding")
            target_precision = precision or self._config["embedding_precision"]
            if target_device != "cuda":
                target_precision = "fp32"
            if (
                self._role_state["embedding"]["loaded"]
                and self._embedding_model is not None
            ):
                current = self._role_state["embedding"]
                if (
                    current["profile"] == target_profile
                    and current["device"] == target_device
                    and current.get("precision") == target_precision
                ):
                    self.touch_role("embedding")
                    return
                self.unload_embedding_model(reason="reload")

            if self._role_state["reasoning"]["loaded"]:
                self.unload_reasoning_model(reason="reasoning_switch")

            entry = self._get_catalog_entry("embedding", target_profile)
            logger.info(
                f"Loading embedding model {target_profile} on {target_device} ({target_precision})..."
            )
            model = SentenceTransformer(entry["model_id"], device=target_device)
            if (
                target_device == "cuda"
                and target_precision == "fp16"
                and entry.get("supports_fp16")
            ):
                model.half()
            elif (
                target_device == "cuda"
                and target_precision == "bf16"
                and entry.get("supports_bf16")
            ):
                bf16_supported = getattr(
                    torch.cuda, "is_bf16_supported", lambda: False
                )()
                if not bf16_supported:
                    raise RuntimeLoadError(
                        "BF16 embeddings are not supported on the current CUDA device."
                    )
                model.bfloat16()
            self._embedding_model = model
            self._embedding_thread_id = threading.get_ident()
            self._role_state["embedding"]["precision"] = target_precision
            logger.info(
                f"Embedding model {target_profile} ready on {target_device} ({target_precision})."
            )
            self._mark_role_loaded("embedding", target_profile, target_device)

    def unload_embedding_model(self, reason: str = "manual"):
        with self._lock:
            if (
                self._embedding_model is None
                and not self._role_state["embedding"]["loaded"]
            ):
                if reason in {"manual", "service_stop", "shutdown"}:
                    self._role_state["embedding"]["enabled"] = False
                return
            self._embedding_model = None
            self._embedding_thread_id = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            self._mark_role_unloaded("embedding", reason)

    def _ensure_embedding_model_ready(self):
        with self._lock:
            if (
                self._embedding_model is None
                or not self._role_state["embedding"]["loaded"]
            ):
                raise RuntimeNotReadyError(["embedding"], ["embedding"])

            current_thread_id = threading.get_ident()
            if self._embedding_thread_id != current_thread_id:
                self._embedding_thread_id = current_thread_id
                logger.info(
                    "Embedding model is being used from a different worker thread; keeping the loaded model and serializing execution."
                )

    def load_reasoning_model(self, profile: Optional[str] = None):
        with self._lock:
            self._ensure_cuda_available(["reasoning"])
            if not self._ollama_is_reachable():
                raise RuntimeLoadError("Ollama is not running or reachable.")
            if self._role_state["embedding"]["loaded"]:
                self.unload_embedding_model(reason="embedding_switch")
            target_profile = profile or self._config["reasoning_profile"]
            keep_alive = (
                f"{int(self._config['reasoning_timeout_minutes'])}m"
                if int(self._config["reasoning_timeout_minutes"]) > 0
                else "24h"
            )
            resolved_model = self._resolve_ollama_model_name(
                self._get_catalog_entry("reasoning", target_profile)["model_id"]
            )
            self._ollama_generate(
                {
                    "model": resolved_model,
                    "prompt": "ping",
                    "stream": False,
                    "keep_alive": keep_alive,
                },
                timeout=30,
            )
            self._mark_role_loaded(
                "reasoning",
                target_profile,
                "cuda" if self._placement_to_device("reasoning") == "cuda" else "cpu",
            )

    def unload_reasoning_model(self, reason: str = "manual"):
        with self._lock:
            if not self._role_state["reasoning"]["loaded"]:
                if reason in {"manual", "service_stop", "shutdown"}:
                    self._role_state["reasoning"]["enabled"] = False
                return
            profile = self._role_state["reasoning"]["profile"]
            if self._ollama_is_reachable():
                try:
                    resolved_model = self._resolve_ollama_model_name(
                        self._get_catalog_entry("reasoning", profile)["model_id"]
                    )
                    self._ollama_generate(
                        {
                            "model": resolved_model,
                            "keep_alive": 0,
                        },
                        timeout=10,
                    )
                except Exception as error:
                    logger.warning(f"Failed to unload reasoning model cleanly: {error}")
            self._mark_role_unloaded("reasoning", reason)

    def touch_role(self, role: str):
        self._role_state[role]["last_used_at"] = time.time()

    def _begin_use(self, role: str):
        self._active_uses[role] += 1
        self.touch_role(role)

    def _end_use(self, role: str):
        self._active_uses[role] = max(0, self._active_uses[role] - 1)
        self.touch_role(role)

    def ensure_roles_loaded(
        self, roles: Iterable[str], allow_start_managed: bool = False
    ) -> Dict[str, Any]:
        role_list = sorted(set(roles))
        if not role_list:
            return self.get_runtime_snapshot()
        preflight = self._preflight_roles(role_list)

        if "reasoning" in role_list and not self._ollama_is_reachable():
            if allow_start_managed:
                self.start_ollama()
            else:
                raise RuntimeLoadError(
                    "Ollama is not connected. Start or connect it first."
                )

        for role in role_list:
            self._role_state[role]["enabled"] = True

        active_role = next(
            (
                role
                for role in ("embedding", "reasoning")
                if self._role_state[role].get("loaded") and role in role_list
            ),
            None,
        )
        if active_role is None:
            active_role = "embedding" if "embedding" in role_list else role_list[0]

        profile = preflight["resolved_profiles"][active_role]
        device = preflight["devices"][active_role]
        if active_role == "embedding":
            self.load_embedding_model(
                profile=profile,
                device=device,
                precision=self._config["embedding_precision"],
            )
        elif active_role == "reasoning":
            self.load_reasoning_model(profile=profile)

        data = self.get_runtime_snapshot(preflight=preflight)
        self._emit({"type": "runtime_status", "data": data})
        return data

    def unload_roles(
        self, roles: Iterable[str], reason: str = "manual"
    ) -> Dict[str, Any]:
        for role in sorted(set(roles)):
            if role == "embedding":
                self.unload_embedding_model(reason=reason)
            elif role == "reasoning":
                self.unload_reasoning_model(reason=reason)
        data = self.get_runtime_snapshot()
        self._emit({"type": "runtime_status", "data": data})
        return data

    def require_roles_ready(self, roles: Iterable[str]):
        role_list = sorted(set(roles))
        self._ensure_cuda_available(role_list)
        missing = [role for role in role_list if not self._role_state[role]["enabled"]]
        service_required = "reasoning" in role_list and not self._ollama_is_reachable()
        if missing or service_required:
            raise RuntimeNotReadyError(
                required_roles=role_list,
                missing_roles=missing or role_list,
                service_required=service_required,
            )
        for role in role_list:
            self.touch_role(role)

    def get_runtime_snapshot(
        self, preflight: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        service_state = "disconnected"
        if self._managed_ollama_process and self._managed_ollama_process.poll() is None:
            service_state = (
                "running_managed" if self._ollama_is_reachable() else "error"
            )
        elif self._ollama_is_reachable():
            service_state = "connected_external"

        return {
            "config": self._config,
            "service": {
                "state": service_state,
                "endpoint": self._get_ollama_root(),
                "managed": bool(
                    self._managed_ollama_process
                    and self._managed_ollama_process.poll() is None
                ),
            },
            "roles": self._role_state,
            "memory": self._memory_snapshot(),
            "catalog": MODEL_CATALOG,
            "preflight": preflight,
            "policy": {
                "single_gpu_mode": any(
                    self._placement_to_device(role) == "cuda"
                    for role in ("embedding", "reasoning")
                ),
                "single_active_role": True,
                "embedding_requires_cuda": self._placement_to_device("embedding")
                == "cuda",
                "reasoning_requires_cuda": self._placement_to_device("reasoning")
                == "cuda",
                "execution_target": (
                    "cuda"
                    if any(
                        self._placement_to_device(role) == "cuda"
                        for role in ("embedding", "reasoning")
                    )
                    else "cpu"
                ),
            },
        }

    def get_embedding(self, text: str):
        if not text or not str(text).strip():
            return None
        self.require_roles_ready(["embedding"])
        with self._embedding_execution_lock:
            if (
                not self._role_state["embedding"]["loaded"]
                or self._embedding_model is None
            ):
                self.load_embedding_model(
                    profile=self._config["embedding_profile"],
                    device=self._placement_to_device("embedding"),
                    precision=self._config["embedding_precision"],
                )
            self._ensure_embedding_model_ready()
            self._begin_use("embedding")
            try:
                vector = self._embedding_model.encode(
                    [str(text)], show_progress_bar=False
                )
                return self._normalize_embedding_vector(vector[0])
            finally:
                self._end_use("embedding")

    def get_embeddings_batch(
        self,
        texts: List[str],
        cancel_event=None,
        batch_size: Optional[int] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ):
        if not texts:
            return []
        self.require_roles_ready(["embedding"])
        with self._embedding_execution_lock:
            if (
                not self._role_state["embedding"]["loaded"]
                or self._embedding_model is None
            ):
                self.load_embedding_model(
                    profile=self._config["embedding_profile"],
                    device=self._placement_to_device("embedding"),
                    precision=self._config["embedding_precision"],
                )
            self._ensure_embedding_model_ready()
            self._begin_use("embedding")
            try:
                clean_texts = [str(t) if t else "" for t in texts]
                encode_batch_size = self._resolve_embedding_batch_size(batch_size)
                device = self._role_state["embedding"].get("device") or "cpu"

                total = len(clean_texts)
                logger.info(
                    f"Embedding {total} texts with batch size {encode_batch_size} on {device}."
                )
                if cancel_event and cancel_event.is_set():
                    raise RuntimeError("INGEST_CANCELLED")
                if progress_callback:
                    progress_callback(0, total)

                vectors = self._embedding_model.encode(
                    clean_texts,
                    batch_size=encode_batch_size,
                    show_progress_bar=False,
                    convert_to_numpy=True,
                )

                if cancel_event and cancel_event.is_set():
                    raise RuntimeError("INGEST_CANCELLED")

                logger.info(f"Embedding progress: {total}/{total}")
                if progress_callback:
                    progress_callback(total, total)

                return [self._normalize_embedding_vector(vector) for vector in vectors]
            finally:
                self._end_use("embedding")

    def analyze_relations_batch(self, highlight_text: str, chunks_list: List[str]):
        if not chunks_list:
            return []
        self.require_roles_ready(["reasoning"])
        if not self._role_state["reasoning"]["loaded"]:
            self.load_reasoning_model(profile=self._config["reasoning_profile"])
        self._begin_use("reasoning")
        try:
            return self._ollama_generate(
                {
                    "model": self._get_catalog_entry(
                        "reasoning", self._role_state["reasoning"]["profile"]
                    )["model_id"],
                    "prompt": self._build_reasoning_prompt(highlight_text, chunks_list),
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.1, "num_predict": 400},
                },
                timeout=60,
            ).get("response", "[]")
        finally:
            self._end_use("reasoning")

    def _build_reasoning_prompt(
        self, highlight_text: str, chunks_list: List[str]
    ) -> str:
        chunks_formatted = ""
        for index, chunk in enumerate(chunks_list):
            snippet = chunk[:400].replace("\n", " ")
            chunks_formatted += f"[{index}] {snippet}\n"

        return f"""You are a philosophical analyzer. Read the User's Highlight. Then read the numbered list of Retrieved Texts.
For each Retrieved Text, determine how it relates to the Highlight.

Rules for each text:
1. Classify the relation as exactly one of: SUPPORT, CHALLENGE, or EXPAND.
2. Provide a 'bridge': a 2-4 word concept that connects them.

User's Highlight: "{highlight_text}"

Retrieved Texts:
{chunks_formatted}

Respond ONLY in valid JSON format as an array of objects, keeping the exact same order as the Retrieved Texts. Example:
[
  {{"relation": "SUPPORT", "bridge": "concept words"}},
  {{"relation": "CHALLENGE", "bridge": "other words"}}
]
"""

    def _sweeper_loop(self):
        while not self._stop_event.wait(15):
            now = time.time()
            for role in ("embedding", "reasoning"):
                state = self._role_state[role]
                timeout_minutes = int(state.get("timeout_minutes") or 0)
                if (
                    not state.get("loaded")
                    or timeout_minutes <= 0
                    or self._active_uses[role] > 0
                    or not state.get("last_used_at")
                ):
                    continue

                if now - float(state["last_used_at"]) >= timeout_minutes * 60:
                    try:
                        if role == "embedding":
                            self.unload_embedding_model(reason="idle_timeout")
                        else:
                            self.unload_reasoning_model(reason="idle_timeout")
                    except Exception as error:
                        self._emit(
                            {
                                "type": "runtime_error",
                                "role": role,
                                "message": str(error),
                            }
                        )

    def shutdown(self):
        self._stop_event.set()
        try:
            self.unload_roles(["embedding", "reasoning"], reason="shutdown")
        finally:
            self.stop_ollama()


runtime_manager = ModelRuntimeManager()
