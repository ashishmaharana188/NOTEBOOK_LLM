import asyncio
import glob
import json
import logging
import mimetypes
import os
import uuid
import re

import numpy as np

# CRITICAL WINDOWS FIX: Kills the multiprocessing spawn bug (WinError 5)
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"

import random
import shutil
import sqlite3
import subprocess
import time
from collections import Counter
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

import requests
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import scripts.hydrator  # <--- ADD THIS
from scripts.build_db import ingest_csvs

# --- INTERNAL IMPORTS ---
from scripts.log_sanitizer import configure_runtime_logging, summarize_text_for_log
from scripts.db_manager import DBManager, graph_db
from scripts.analysis_engine import SUPPORTED_ANALYSIS_MODES, run_analysis
from scripts.echo_engine import get_echo_context
from scripts.graph_engine import add_custom_edge, add_custom_node, get_core_graph
from scripts.ingest_queue import ingest_queue_manager
from scripts.librarian import (
    build_catalog,
    download_book,
    download_ia_item,
    search_gutenberg,
    search_internet_archive_async,
)
from scripts.library_maintenance import refresh_library_files
from scripts.model_runtime import (
    RuntimeLoadError,
    RuntimeNotReadyError,
    runtime_manager,
)
from scripts.parsers import read_any_file_metadata
from scripts.reader_service import ReaderManifestService, compute_file_fingerprint

# Notice we completely removed the reasoning import from here!
# --- NEW MAINTENANCE & RECOMMENDER IMPORTS ---
from scripts.recommender import get_recommendations
from scripts.vectorize import get_embedding, load_model, unload_model
from scripts.vectorize_registry import stop_vectorization, vectorize_registry

# --- CONFIGURATION ---
BASE_DIR = os.getcwd()
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
LIBRARY_DIR = os.path.join(BASE_DIR, "data", "library")
METADATA_DIR = os.path.join(BASE_DIR, "data", "metadata")
CRAWLER_DIR = os.path.join(BASE_DIR, "data", "crawler")
READER_CACHE_DIR = os.path.join(BASE_DIR, "data", "reader_cache")
GUTENBERG_DB = "gutenbergindex.db"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
configure_runtime_logging()

db = DBManager()
reader_manifest_service = ReaderManifestService(
    graph_db=graph_db,
    library_dir=LIBRARY_DIR,
    cache_dir=READER_CACHE_DIR,
)
stance_engine = None


def clean_title_for_search(title: str) -> str:
    if not title:
        return ""
    return title.lower().replace(",", "").replace(".", "").replace(":", "").strip()


def _reader_reasoning_json_fallback(prompt: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        runtime_manager.require_roles_ready(["reasoning"])
        return runtime_manager.generate_structured_json(prompt, fallback=fallback)
    except (RuntimeNotReadyError, RuntimeLoadError):
        return fallback
    except Exception as error:
        logger.warning("Reader reasoning fallback failed: %s", error)
        return fallback


def _lookup_dictionary_entry(term: str, language: str = "en") -> dict[str, Any] | None:
    safe_term = re.sub(r"\s+", " ", str(term or "").strip())
    if not safe_term:
        return None

    try:
        response = requests.get(
            f"https://api.dictionaryapi.dev/api/v2/entries/{language}/{safe_term}",
            timeout=8,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
        if not isinstance(payload, list) or not payload:
            return None
        entry = payload[0] or {}
        phonetic = str(entry.get("phonetic") or "").strip()
        meanings = entry.get("meanings") or []
        definitions: list[dict[str, Any]] = []
        for meaning in meanings:
            part_of_speech = str(meaning.get("partOfSpeech") or "").strip()
            for definition in meaning.get("definitions") or []:
                text = str(definition.get("definition") or "").strip()
                if not text:
                    continue
                definitions.append(
                    {
                        "part_of_speech": part_of_speech,
                        "definition": text,
                        "example": str(definition.get("example") or "").strip(),
                    }
                )
                if len(definitions) >= 8:
                    break
            if len(definitions) >= 8:
                break
        if not definitions:
            return None
        return {
            "term": str(entry.get("word") or safe_term),
            "phonetic": phonetic,
            "definitions": definitions,
            "source": "dictionaryapi.dev",
        }
    except Exception as error:
        logger.warning("Dictionary lookup failed: %s", error)
        return None


def _translate_with_public_google(
    text: str,
    source_language: str = "auto",
    target_language: str = "en",
) -> dict[str, Any] | None:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        return None
    try:
        response = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={
                "client": "gtx",
                "sl": source_language or "auto",
                "tl": target_language or "en",
                "dt": "t",
                "q": normalized_text,
            },
            timeout=10,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
        translated_chunks = payload[0] if isinstance(payload, list) and payload else []
        translated_text = "".join(
            str(chunk[0] or "") for chunk in translated_chunks if isinstance(chunk, list)
        ).strip()
        detected_source = ""
        if isinstance(payload, list) and len(payload) > 2:
            detected_source = str(payload[2] or "").strip()
        if not translated_text:
            return None
        return {
            "translated_text": translated_text,
            "source_language": detected_source or source_language or "auto",
            "target_language": target_language or "en",
            "provider": "google_public",
        }
    except Exception as error:
        logger.warning("Public translation failed: %s", error)
        return None


def start_ollama_service():
    try:
        requests.get("http://localhost:11434")
        logger.info("✅ Ollama Service is already running.")
        return True
    except:
        logger.warning("⚠️ Ollama not detected. Attempting to start service...")
        try:
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            for _ in range(5):
                try:
                    time.sleep(2)
                    requests.get("http://localhost:11434")
                    logger.info("🚀 Ollama Service started successfully.")
                    return True
                except:
                    pass
            return False
        except Exception:
            return False


def warm_up_model():
    runtime_snapshot = runtime_manager.get_runtime_snapshot()
    reasoning_profile = runtime_snapshot["config"].get(
        "reasoning_profile", "qwen2.5:0.5b-instruct"
    )
    resolved_model = runtime_snapshot.get("resolved", {}).get("reasoning_model_tag")
    logger.info(f"🔥 Warming up reasoning model ({reasoning_profile})...")
    try:
        requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": resolved_model or reasoning_profile,
                "prompt": "Hi",
                "stream": False,
                "options": {"num_ctx": 128},
            },
            timeout=5,
        )
        logger.info("✅ Model Loaded & Ready!")
    except Exception as e:
        logger.warning(f"⚠️ Model warm-up failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global stance_engine, APP_LOOP
    try:
        logger.info("✅ Stance Engine initialized (Placeholder).")
    except Exception as e:
        logger.error(f"⚠️ Could not load Stance Engine: {e}")

    APP_LOOP = asyncio.get_running_loop()

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    os.makedirs(METADATA_DIR, exist_ok=True)
    os.makedirs(CRAWLER_DIR, exist_ok=True)
    os.makedirs(READER_CACHE_DIR, exist_ok=True)

    if not os.path.exists(GUTENBERG_DB):
        asyncio.create_task(asyncio.to_thread(build_catalog))

    yield

    # --- SHUTDOWN CLEANUP ---
    logger.info("Server stopping. Initiating ingest queue cleanup...")
    ingest_queue_manager.shutdown()
    logger.info("Server stopping. Initiating model runtime cleanup...")
    runtime_manager.shutdown()
    logger.info("Model runtime cleanup completed.")


app = FastAPI(lifespan=lifespan)

# -- local storage

UPLOAD_DIR = "stored_files"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LIBRARY_DIR, exist_ok=True)

# This allows the frontend to access files via https://doomprompting123-space.hf.space/files/filename.jpg
app.mount("/stored_files", StaticFiles(directory=UPLOAD_DIR), name="files")


app.mount("/library_media", StaticFiles(directory=LIBRARY_DIR), name="library_files")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    author: Optional[str] = None
    year_min: Optional[int] = None
    group_tag: Optional[str] = None


class ClusterTitleUpdateRequest(BaseModel):
    cluster_id: str
    title: str


class GutenbergRequest(BaseModel):
    book_id: str
    title: str
    author: str = "Unknown"
    year: int = 0
    preferred_format: str = "epub"


class IARequest(BaseModel):
    identifier: str
    title: str
    author: str = "Unknown"
    year: int = 0
    preferred_format: str = "epub"


class IngestRequest(BaseModel):
    filename: str


class CancelIngestRequest(BaseModel):
    filename: Optional[str] = None
    job_id: Optional[str] = None


class RuntimeConfigRequest(BaseModel):
    runtime_preset: Optional[str] = None
    ollama_endpoint: Optional[str] = None
    local_reasoning_ollama_tag: Optional[str] = None
    embedding_profile: Optional[str] = None
    reasoning_profile: Optional[str] = None
    embedding_timeout_minutes: Optional[int] = None
    reasoning_timeout_minutes: Optional[int] = None
    embedding_placement: Optional[str] = None
    reasoning_placement: Optional[str] = None
    embedding_precision: Optional[str] = None
    embedding_eager_unload: Optional[bool] = None
    embedding_low_memory_profile: Optional[str] = None
    reasoning_low_memory_profile: Optional[str] = None


class RuntimeRolesRequest(BaseModel):
    roles: List[str]
    allow_start_managed: bool = False


class ReaderSessionUpdateRequest(BaseModel):
    lid: Optional[str] = None
    format: Optional[str] = None
    last_location: Optional[Union[str, int, float]] = None
    last_location_type: Optional[str] = None
    progress_percent: Optional[float] = None
    last_page_label: Optional[str] = None
    view_state: Dict[str, Any] = {}


class ReaderAnnotationCreateRequest(BaseModel):
    lid: Optional[str] = None
    format: Optional[str] = None
    anchor: Dict[str, Any]
    quote_text: str = ""
    title: str = ""
    note: str = ""
    color: str = ""
    kind: str = "bookmark"
    page_label: str = ""
    chapter_label: str = ""


class ReaderAnnotationUpdateRequest(BaseModel):
    anchor: Dict[str, Any]
    quote_text: str = ""
    title: str = ""
    note: str = ""
    color: str = ""
    kind: str = "bookmark"
    page_label: str = ""
    chapter_label: str = ""


class ReaderSearchRequest(BaseModel):
    lid: Optional[str] = None
    query: str
    limit: int = 25


class ReaderDefineRequest(BaseModel):
    term: str
    context: str = ""
    language: str = "en"


class ReaderTranslateRequest(BaseModel):
    text: str
    source_language: str = "auto"
    target_language: str = "en"
    mode: str = "selection"
    context: str = ""


class RecommenderSearchRequest(BaseModel):
    topic: str
    limit: int = 50
    group_tag: Optional[str] = None


class EchoContextRequest(BaseModel):
    text: str
    year: int = 0
    limit: int = 20
    book_title: Optional[str] = None
    book_author: Optional[str] = None


class ResolveRequest(BaseModel):
    title: str


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass


manager = ConnectionManager()
APP_LOOP: Optional[asyncio.AbstractEventLoop] = None


def broadcast_app_event(message: Dict[str, Any]):
    global APP_LOOP
    if APP_LOOP and APP_LOOP.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(message), APP_LOOP)
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(message))
    except RuntimeError:
        asyncio.run(manager.broadcast(message))


runtime_manager.set_broadcaster(broadcast_app_event)
ingest_queue_manager.set_broadcaster(broadcast_app_event)
reader_manifest_service.set_broadcaster(broadcast_app_event)


def runtime_error_response(error: Union[RuntimeNotReadyError, RuntimeLoadError]):
    if isinstance(error, RuntimeNotReadyError):
        return JSONResponse(status_code=409, content=error.to_payload())
    return JSONResponse(
        status_code=400,
        content={
            "status": "error",
            "code": "RUNTIME_LOAD_FAILED",
            "message": str(error),
        },
    )


def resolve_reader_identity(filename: str, lid: Optional[str] = None):
    identity = graph_db.resolve_reader_book_identity(filename, lid)
    resolved_path = identity.get("file_path") or os.path.join(
        LIBRARY_DIR, identity["filename"]
    )
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="Reader file not found")
    identity["file_path"] = resolved_path
    identity["file_fingerprint"] = compute_file_fingerprint(resolved_path)
    return identity


class GraphEdgeRequest(BaseModel):
    source_id: str
    target_id: str
    edge_type: str = "explicit"
    context_text: str = ""
    weight: float = 1.0


class GraphNodeRequest(BaseModel):
    node_id: str
    label: str
    node_type: str = "concept"
    description: str = ""


class NoteSaveRequest(BaseModel):
    note_id: str
    content: str
    linked_book_id: Optional[str] = None


class EchoSaveRequest(BaseModel):
    book_id: str  # The fallback display string
    library_id: str = ""  # NEW: The indestructible ID!
    cluster_id: str = ""
    highlight: str
    context: str
    ai_insight: str
    filename: str = ""
    source_lid: str = ""  # NEW: Where the text actually came from
    original_chunk_id: str = ""
    source_chunk_ref: str = ""  # <--- NEW V2 FIELD: The indestructible text hash
    title: str = ""


class AnalysisContextItem(BaseModel):
    context_id: str = ""
    kind: str = "context"
    anchor_id: str = ""
    title: str = ""
    text: str = ""
    chapter: str = ""
    source_label: str = ""
    echo_id: str = ""
    cluster_id: str = ""
    book_id: str = ""
    library_id: str = ""
    filename: str = ""
    chunk_id: str = ""
    chunk_ref: str = ""
    source_lid: str = ""
    full_text: str = ""
    marker: Dict[str, Any] = Field(default_factory=dict)


class AnalysisSelectionRef(BaseModel):
    kind: str
    id: str = ""
    label: str = ""
    cluster_id: str = ""
    echo_id: str = ""


class EchoAnalysisRunRequest(BaseModel):
    mode: str
    prompt: str = ""
    include_web: bool = True
    title_hint: str = ""
    contexts: List[AnalysisContextItem] = Field(default_factory=list)
    selection_refs: List[AnalysisSelectionRef] = Field(default_factory=list)


class EchoAnalysisSaveRequest(BaseModel):
    mode: str
    title: str
    summary: str
    prompt: str = ""
    include_web: bool = True
    contexts: List[AnalysisContextItem] = Field(default_factory=list)
    selection_refs: List[AnalysisSelectionRef] = Field(default_factory=list)
    local_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    web_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    follow_ups: List[str] = Field(default_factory=list)
    source_anchor_ids: List[str] = Field(default_factory=list)
    parent_cluster_id: str = ""
    source_echo_id: str = ""
    target_cluster_id: str = ""
    make_active: bool = False
    origin_context: Dict[str, Any] = Field(default_factory=dict)


class SpatialMetadataItem(BaseModel):
    item_id: str
    item_type: str  # 'ECHO', 'NOTES', or 'ARCHIVE'
    x_coord: float
    y_coord: float
    orientation: str = "portrait"
    z_index: int = 0  # <-- NEW


class SpatialMetadataBulkRequest(BaseModel):
    items: List[SpatialMetadataItem]


class EchoDeleteRequest(BaseModel):
    echo_id: str


class ClusterSpawnRequest(BaseModel):
    book_id: str
    library_id: str = ""
    parent_cluster_id: str
    source_echo_id: str = ""
    title: str = ""
    make_active: bool = True
    origin_context: Dict[str, Any] = Field(default_factory=dict)


class ClusterActivateRequest(BaseModel):
    cluster_id: str
    book_id: str
    library_id: str = ""


class NoteItemUpdateRequest(BaseModel):
    note_id: str
    title: str
    content: str
    tags: str = ""
    group_id: Optional[str] = None  # <--- ADD THIS


class NoteStackCreateRequest(BaseModel):
    title: str


class NoteGroupCreateRequest(BaseModel):
    title: str
    stack_id: str  # <--- Added this field
    linked_book_id: Optional[str] = None


class EchoTitleUpdateRequest(BaseModel):
    echo_id: str
    title: str
    chunk_id: str = ""


class NoteStackUpdateRequest(BaseModel):
    stack_id: str
    title: str


class NoteGroupUpdateRequest(BaseModel):
    group_id: str
    title: str


class TagUpdateRequest(BaseModel):
    item_id: str
    tags: str
    item_type: str


class QuickThoughtsRequest(BaseModel):
    item_id: str
    thoughts: str
    item_type: str


class ArchiveGroupRequest(BaseModel):
    items: List[str]
    type: str  # "ECHO" or "NOTES"


class UnarchiveGroupRequest(BaseModel):
    archive_id: str
    type: str  # "ECHO" or "NOTES"


class LayoutItem(BaseModel):
    type: str
    id: str


class ClusterLayoutUpdateRequest(BaseModel):
    cluster_id: str
    orbit_layout: List[LayoutItem]


class ArchiveGroupRequest(BaseModel):
    items: List[str]
    type: str  # "ECHO" or "NOTES"
    parent_id: Optional[str] = None


@app.post("/echo/context")
def echo_context_endpoint(request: EchoContextRequest):
    try:
        runtime_manager.require_roles_ready(["embedding", "reasoning"])
        results = get_echo_context(
            query_text=request.text,
            current_book_title=request.book_title,
            current_book_author=request.book_author,
            limit=request.limit,
        )
        return {"status": "success", "data": results}
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Echo Error: {e}")
        return {"status": "error", "message": str(e)}


class ContextExpandRequest(BaseModel):
    filename: str
    chunk_id: str
    window: int = 5


class NoteItemCreateRequest(BaseModel):
    group_id: Optional[str] = None
    title: str
    content: str
    tags: str = ""
    linked_echo_id: Optional[str] = None


class OrbitMetadataItem(BaseModel):
    item_id: str
    item_type: str
    parent_id: str
    x: float
    y: float
    z_index: int


class OrbitMetadataRequest(BaseModel):
    metadata: List[OrbitMetadataItem]


class SubArchiveRequest(BaseModel):
    items: List[str]
    title: str = "Archived Folder"
    # Legacy fields (for safety during transition)
    parent_stack_id: Optional[str] = None
    canvas_mode: Optional[str] = None
    # New explicit fields
    owner_item_id: Optional[str] = None
    owner_item_type: Optional[str] = "stack"
    display_parent_id: Optional[str] = None
    restore_group_id: Optional[str] = None


class RemoveScatteredRequest(BaseModel):
    items: List[str]
    canvas_mode: str


# --- 2. ADD THIS NEW REQUEST CLASS ---
class LinkNoteEchoRequest(BaseModel):
    echo_id: str
    note_id: str


class SpatialLinkRequest(BaseModel):
    item_ids: List[str]


class UnarchiveSpecificRequest(BaseModel):
    items: List[str]
    type: str  # "ECHO" or "NOTES"


class ArchiveTitleUpdateRequest(BaseModel):
    archive_id: str
    title: str
    type: str  # "ECHO" or "NOTES"


class ArchiveAppendRequest(BaseModel):
    target_archive_id: str
    item_ids: List[str]


@app.post("/echo/expand_context")
def expand_context_endpoint(request: ContextExpandRequest):
    try:
        chunks = db.get_surrounding_chunks(
            request.filename, request.chunk_id, request.window
        )
        # Stitch them together with double line breaks for beautiful reading
        stitched_text = "\n\n".join(chunks)
        return {"status": "success", "text": stitched_text}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/brain/echoes/saved")
def get_saved_echoes_endpoint():
    try:
        from scripts.db_manager import graph_db

        # 1. Fetch your core data
        clusters = graph_db.get_all_saved_clusters()
        # CHANGED: Now explicitly fetching all individual notes rather than note stacks
        notes = graph_db.get_all_notes()

        # 2. NEW: Fetch the spatial layout metadata
        spatial_meta = graph_db.get_spatial_metadata()
        manual_links = graph_db.get_manual_links()

        # 3. Return it all in the payload
        return {
            "status": "success",
            "data": list(clusters.values()) if isinstance(clusters, dict) else clusters,
            "notes": notes,
            "spatial_metadata": spatial_meta,
            "manual_links": manual_links,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/echo/analysis/run")
def run_echo_analysis_endpoint(request: EchoAnalysisRunRequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
        result = run_analysis(
            mode=request.mode,
            prompt=request.prompt,
            contexts=[item.dict() for item in request.contexts],
            selection_refs=[item.dict() for item in request.selection_refs],
            include_web=bool(request.include_web),
            title_hint=request.title_hint,
        )
        return {"status": "success", "data": result}
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except RuntimeLoadError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Derived analysis failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/echo/analysis/save")
def save_echo_analysis_endpoint(request: EchoAnalysisSaveRequest):
    try:
        normalized_mode = str(request.mode or "analysis").strip().lower() or "analysis"
        mode_label = SUPPORTED_ANALYSIS_MODES.get(normalized_mode, request.mode or "Analysis")
        column_kind = "rag" if normalized_mode == "rag" else "analysis"
        normalized_contexts = [item.dict() for item in request.contexts]
        normalized_selection_refs = [item.dict() for item in request.selection_refs]

        def _first_non_empty(items, key):
            for item in items:
                value = str(item.get(key) or "").strip()
                if value:
                    return value
            return ""

        origin_context = dict(request.origin_context or {})
        if not origin_context:
            origin_context = next(
                (
                    {
                        k: v
                        for k, v in ctx.items()
                        if k not in {"marker"} and str(v or "").strip()
                    }
                    for ctx in normalized_contexts
                    if str(ctx.get("text") or "").strip()
                ),
                {},
            )
        if not origin_context:
            origin_context = {
                "title": request.title.strip() or mode_label,
                "text": request.prompt.strip() or request.summary.strip(),
                "chapter": "",
                "source_label": "",
            }

        parent_cluster_id = (
            str(request.parent_cluster_id or "").strip()
            or str(origin_context.get("cluster_id") or "").strip()
            or _first_non_empty(normalized_contexts, "cluster_id")
            or _first_non_empty(normalized_selection_refs, "cluster_id")
        )
        source_echo_id = (
            str(request.source_echo_id or "").strip()
            or str(origin_context.get("echo_id") or "").strip()
            or _first_non_empty(normalized_contexts, "echo_id")
            or _first_non_empty(normalized_selection_refs, "echo_id")
        )

        source_anchor_ids = []
        for value in [
            *(request.source_anchor_ids or []),
            *[ctx.get("anchor_id") for ctx in normalized_contexts],
            parent_cluster_id,
        ]:
            anchor_id = str(value or "").strip()
            if anchor_id and anchor_id not in source_anchor_ids:
                source_anchor_ids.append(anchor_id)

        target_cluster_id = str(request.target_cluster_id or "").strip()
        if not target_cluster_id and parent_cluster_id:
            target_cluster_id = (
                graph_db.find_cluster_by_parent_source_mode(
                    parent_cluster_id=parent_cluster_id,
                    source_echo_id=source_echo_id,
                    column_kind=column_kind,
                    mode=normalized_mode,
                )
                or ""
            )

        parent_cluster = graph_db.get_cluster(parent_cluster_id) if parent_cluster_id else None
        target_cluster = graph_db.get_cluster(target_cluster_id) if target_cluster_id else None

        cluster_book_id = (
            (target_cluster or {}).get("book_id")
            or (parent_cluster or {}).get("book_id")
            or str(origin_context.get("book_id") or "").strip()
            or request.title.strip()
            or mode_label
        )
        cluster_library_id = (
            (target_cluster or {}).get("library_id")
            or (parent_cluster or {}).get("library_id")
            or str(origin_context.get("library_id") or "").strip()
            or None
        )

        base_title = (
            str(origin_context.get("title") or "").strip()
            or request.title.strip()
            or mode_label
        )
        if target_cluster:
            cluster_title = str(target_cluster.get("title") or "").strip() or base_title
        else:
            cluster_title = base_title
            if mode_label.lower() not in cluster_title.lower():
                cluster_title = f"{cluster_title} {mode_label}".strip()

        now = time.strftime("%Y-%m-%d %H:%M:%S")
        next_column_metadata = dict((target_cluster or {}).get("column_metadata") or {})
        existing_source_contexts = list(next_column_metadata.get("source_contexts") or [])
        context_key = str(origin_context.get("context_id") or origin_context.get("title") or cluster_title)
        trimmed_origin_context = {
            key: value
            for key, value in origin_context.items()
            if key != "marker" and value not in (None, "")
        }
        trimmed_origin_context["saved_at"] = now
        trimmed_origin_context["context_key"] = context_key
        deduped_source_contexts = [trimmed_origin_context]
        for item in existing_source_contexts:
            if str(item.get("context_key") or "") == context_key:
                continue
            deduped_source_contexts.append(item)

        source_echo_ids = []
        for value in [
            source_echo_id,
            *[ctx.get("echo_id") for ctx in normalized_contexts],
        ]:
            next_echo_id = str(value or "").strip()
            if next_echo_id and next_echo_id not in source_echo_ids:
                source_echo_ids.append(next_echo_id)

        next_column_metadata.update(
            {
                "column_kind": column_kind,
                "mode": normalized_mode,
                "mode_label": mode_label,
                "origin_context": trimmed_origin_context,
                "source_contexts": deduped_source_contexts[:16],
                "source_anchor_ids": source_anchor_ids,
                "source_echo_ids": source_echo_ids,
                "updated_at": now,
            }
        )

        cluster_id = target_cluster_id or f"cluster_{uuid.uuid4().hex[:8]}"
        if not target_cluster_id:
            graph_db.create_cluster(
                cluster_id=cluster_id,
                book_id=cluster_book_id,
                parent_cluster_id=parent_cluster_id or None,
                library_id=cluster_library_id,
                source_echo_id=source_echo_id or None,
                title=cluster_title,
                is_active=bool(request.make_active),
                column_metadata=next_column_metadata,
            )
        else:
            graph_db.update_cluster_metadata(cluster_id, next_column_metadata)
            if request.make_active:
                graph_db.set_active_cluster(
                    cluster_id,
                    str(target_cluster.get("book_id") or cluster_book_id),
                    str(target_cluster.get("library_id") or cluster_library_id or ""),
                )

        echo_id = f"echo_{uuid.uuid4().hex[:8]}"
        graph_db.save_compound_echo(
            echo_id=echo_id,
            cluster_id=cluster_id,
            ai_insight=request.summary,
            sources_list=[
                {
                    "title": cluster_title,
                    "highlight": request.summary,
                    "context": request.prompt or request.mode,
                    "filename": str(origin_context.get("filename") or cluster_title),
                    "source_lid": str(origin_context.get("source_lid") or ""),
                    "original_chunk_id": str(origin_context.get("chunk_id") or ""),
                    "source_chunk_ref": str(origin_context.get("chunk_ref") or ""),
                    "date": now,
                }
            ],
            weight=1,
            title=request.title.strip() or cluster_title,
            analysis_metadata={
                "mode": normalized_mode,
                "mode_label": mode_label,
                "column_kind": column_kind,
                "prompt": request.prompt,
                "include_web": bool(request.include_web),
                "contexts": normalized_contexts,
                "origin_context": trimmed_origin_context,
                "selection_refs": normalized_selection_refs,
                "local_evidence": request.local_evidence,
                "web_evidence": request.web_evidence,
                "follow_ups": request.follow_ups,
                "source_anchor_ids": source_anchor_ids,
                "saved_at": now,
            },
        )

        for ctx in normalized_contexts:
            marker = dict(ctx.get("marker") or {})
            marker_echo_id = str(ctx.get("echo_id") or "").strip()
            if not marker_echo_id or not str(marker.get("quote") or "").strip():
                continue

            existing_metadata = graph_db.get_echo_analysis_metadata(marker_echo_id)
            saved_markers = list(existing_metadata.get("saved_markers") or [])
            marker_id = str(marker.get("marker_id") or f"marker_{uuid.uuid4().hex[:8]}")
            marker["marker_id"] = marker_id
            marker["linked_cluster_id"] = cluster_id
            marker["linked_echo_id"] = echo_id
            marker["mode"] = normalized_mode
            marker["saved_at"] = now
            marker["source_context_title"] = str(trimmed_origin_context.get("title") or "")

            next_saved_markers = [marker]
            for existing_marker in saved_markers:
                if str(existing_marker.get("marker_id") or "") == marker_id:
                    continue
                next_saved_markers.append(existing_marker)

            existing_metadata["saved_markers"] = next_saved_markers[:32]
            graph_db.update_echo_analysis_metadata(marker_echo_id, existing_metadata)

        return {
            "status": "success",
            "cluster_id": cluster_id,
            "echo_id": echo_id,
            "reused_cluster": bool(target_cluster_id),
        }
    except Exception as e:
        logger.error(f"Saving derived analysis failed: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/brain/echo/update_title")
def update_echo_title_endpoint(request: EchoTitleUpdateRequest):
    """Fast-path update for renaming snippets without triggering semantic merges."""
    try:
        from scripts.db_manager import graph_db

        # Now passing the specific chunk_id!
        graph_db.update_echo_title(request.echo_id, request.title, request.chunk_id)
        return {"status": "success", "echo_id": request.echo_id}
    except Exception as e:
        logger.error(f"Error updating echo title: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/")
def read_root():
    return {"status": "Cognition Graph API is running"}


@app.get("/system/runtime")
def system_runtime_endpoint():
    return {"status": "success", "data": runtime_manager.get_runtime_snapshot()}


@app.put("/system/runtime/config")
def system_runtime_config_endpoint(request: RuntimeConfigRequest):
    try:
        payload = (
            request.model_dump() if hasattr(request, "model_dump") else request.dict()
        )
        updates = {k: v for k, v in payload.items() if v is not None}
        return {"status": "success", "data": runtime_manager.update_config(updates)}
    except RuntimeLoadError as error:
        return runtime_error_response(error)


@app.post("/system/ollama/connect")
def connect_ollama_endpoint():
    try:
        return {"status": "success", "data": runtime_manager.connect_ollama()}
    except RuntimeLoadError as error:
        return runtime_error_response(error)


@app.post("/system/ollama/start")
def start_ollama_endpoint():
    try:
        return {"status": "success", "data": runtime_manager.start_ollama()}
    except RuntimeLoadError as error:
        return runtime_error_response(error)


@app.post("/system/ollama/stop")
def stop_ollama_endpoint():
    return {"status": "success", "data": runtime_manager.stop_ollama()}


@app.post("/system/models/load")
def load_models_endpoint(request: RuntimeRolesRequest):
    try:
        data = runtime_manager.ensure_roles_loaded(
            request.roles, allow_start_managed=request.allow_start_managed
        )
        return {"status": "success", "data": data}
    except (RuntimeLoadError, RuntimeNotReadyError) as error:
        return runtime_error_response(error)


@app.post("/system/models/unload")
def unload_models_endpoint(request: RuntimeRolesRequest):
    return {
        "status": "success",
        "data": runtime_manager.unload_roles(request.roles),
    }


@app.post("/system/models/ensure")
def ensure_models_endpoint(request: RuntimeRolesRequest):
    try:
        data = runtime_manager.ensure_roles_loaded(
            request.roles, allow_start_managed=request.allow_start_managed
        )
        return {"status": "success", "data": data}
    except (RuntimeLoadError, RuntimeNotReadyError) as error:
        return runtime_error_response(error)


@app.post("/search")
def search(request: SearchRequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
        query_vector = get_embedding(request.query)
        limit_val = int(request.top_k)
        results = db.search(
            query_vector,
            limit=limit_val,
            author=request.author,
            year_min=request.year_min,
            group_tag=request.group_tag,
        )
        formatted_results = []
        if isinstance(results, list):
            for r in results:
                if isinstance(r, dict):
                    formatted_results.append(
                        {
                            "text": r.get("text", ""),
                            "score": 1.0 - r.get("_distance", 0.0),
                            "title": r.get("title", ""),
                            "author": r.get("author", ""),
                            "year": r.get("year", 0),
                            "group_tag": r.get("group_tag", ""),
                            "sentiment": r.get("sentiment", 0.0),
                        }
                    )
        return {"results": formatted_results}
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return {"results": [], "error": str(e)}


@app.get("/library")
def get_library():
    files = []
    if os.path.exists(LIBRARY_DIR):
        files = os.listdir(LIBRARY_DIR)
    return {"files": files}


@app.get("/brain/books")
def get_brain_books():
    books = db.get_all_books()
    return {"books": books}


@app.get("/reader/books/{filename}/bootstrap")
def reader_bootstrap_endpoint(
    filename: str,
    request: Request,
    lid: Optional[str] = Query(default=None),
):
    identity = resolve_reader_identity(filename, lid)
    session = graph_db.get_reader_session(identity["filename"], identity["lid"])

    if session and session.get("file_fingerprint") != identity["file_fingerprint"]:
        session = graph_db.upsert_reader_session(
            identity["filename"],
            {
                "format": identity["format"],
                "last_location": None,
                "last_location_type": "",
                "progress_percent": 0.0,
                "last_page_label": "",
                "view_state": {},
                "file_fingerprint": identity["file_fingerprint"],
            },
            identity["lid"],
        )
    elif not session:
        session = graph_db.upsert_reader_session(
            identity["filename"],
            {
                "format": identity["format"],
                "last_location": None,
                "last_location_type": "",
                "progress_percent": 0.0,
                "last_page_label": "",
                "view_state": {},
                "file_fingerprint": identity["file_fingerprint"],
            },
            identity["lid"],
        )

    manifest = None
    manifest_status = "ready"
    if identity["format"] != "epub":
        _, manifest, manifest_status = reader_manifest_service.ensure_manifest(
            identity["filename"], identity["lid"]
        )
    else:
        manifest = graph_db.get_reader_manifest(identity["filename"], identity["lid"])
        if manifest and str(manifest.get("status") or "").lower() == "error":
            manifest_status = "error"
    annotations = graph_db.get_reader_annotations(identity["filename"], identity["lid"])

    manifest_summary = {
        "status": manifest_status,
        "page_count": int((manifest or {}).get("page_count") or 0),
        "toc": (manifest or {}).get("toc") or [],
        "section_index": (manifest or {}).get("section_index") or [],
        "location_map": (manifest or {}).get("location_map") or [],
        "content_meta": (manifest or {}).get("content_meta") or {},
        "updated_at": (manifest or {}).get("updated_at"),
    }

    file_url = request.url_for(
        "get_reader_file_endpoint",
        filename=identity["filename"],
    ).include_query_params(v=identity["file_fingerprint"])
    if identity["lid"]:
        file_url = file_url.include_query_params(lid=identity["lid"])

    return {
        "status": "success",
        "data": {
            "book": {
                "lid": identity["lid"] or "",
                "filename": identity["filename"],
                "title": identity["title"],
                "author": identity["author"],
                "extension": identity["format"],
                "url": str(file_url),
                "file_fingerprint": identity["file_fingerprint"],
            },
            "session": session,
            "manifest": manifest_summary,
            "annotations": annotations,
        },
    }


@app.put("/reader/books/{filename}/session")
def update_reader_session_endpoint(
    filename: str,
    request: ReaderSessionUpdateRequest,
):
    identity = resolve_reader_identity(filename, request.lid)
    session = graph_db.upsert_reader_session(
        identity["filename"],
        {
            "format": request.format or identity["format"],
            "last_location": request.last_location,
            "last_location_type": request.last_location_type or "",
            "progress_percent": request.progress_percent or 0.0,
            "last_page_label": request.last_page_label or "",
            "view_state": request.view_state or {},
            "file_fingerprint": identity["file_fingerprint"],
        },
        identity["lid"],
    )
    broadcast_app_event(
        {
            "type": "READER_SESSION_UPDATED",
            "filename": identity["filename"],
            "lid": identity["lid"] or "",
            "session": session,
        }
    )
    return {"status": "success", "data": session}


@app.get("/reader/books/{filename}/annotations")
def get_reader_annotations_endpoint(
    filename: str,
    lid: Optional[str] = Query(default=None),
):
    annotations = graph_db.get_reader_annotations(filename, lid)
    return {"status": "success", "data": annotations}


@app.post("/reader/books/{filename}/annotations")
def create_reader_annotation_endpoint(
    filename: str,
    request: ReaderAnnotationCreateRequest,
):
    annotation = graph_db.create_reader_annotation(
        filename,
        request.dict(),
        request.lid,
    )
    return {"status": "success", "data": annotation}


@app.put("/reader/annotations/{annotation_id}")
def update_reader_annotation_endpoint(
    annotation_id: str,
    request: ReaderAnnotationUpdateRequest,
):
    annotation = graph_db.update_reader_annotation(annotation_id, request.dict())
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"status": "success", "data": annotation}


@app.delete("/reader/annotations/{annotation_id}")
def delete_reader_annotation_endpoint(annotation_id: str):
    deleted = graph_db.delete_reader_annotation(annotation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return {"status": "success"}


@app.get("/reader/files/{filename}")
async def get_reader_file_endpoint(
    filename: str,
    lid: Optional[str] = Query(default=None),
):
    identity = resolve_reader_identity(filename, lid)
    media_type = (
        {
            "epub": "application/epub+zip",
            "pdf": "application/pdf",
            "txt": "text/plain; charset=utf-8",
            "md": "text/markdown; charset=utf-8",
        }.get(identity["format"])
        or mimetypes.guess_type(identity["filename"])[0]
        or "application/octet-stream"
    )
    return FileResponse(
        path=identity["file_path"],
        filename=identity["filename"],
        media_type=media_type,
        content_disposition_type="inline",
        headers={
            "Cache-Control": "public, max-age=3600, must-revalidate",
            "Accept-Ranges": "bytes",
        },
    )


@app.get("/reader/books/{filename}/content")
def get_reader_content_endpoint(
    filename: str,
    lid: Optional[str] = Query(default=None),
    section: int = Query(default=0, ge=0),
    limit: int = Query(default=1, ge=1, le=5),
):
    identity, manifest, sections, status = reader_manifest_service.get_text_sections(
        filename,
        section=section,
        limit=limit,
        lid=lid,
    )
    return {
        "status": "success",
        "data": {
            "book": {
                "lid": identity["lid"] or "",
                "filename": identity["filename"],
                "extension": identity["format"],
            },
            "manifest_status": status,
            "manifest": {
                "page_count": int((manifest or {}).get("page_count") or 0),
                "section_index": (manifest or {}).get("section_index") or [],
                "content_meta": (manifest or {}).get("content_meta") or {},
            },
            "sections": sections,
        },
    }


@app.post("/reader/books/{filename}/search")
def reader_search_endpoint(filename: str, request: ReaderSearchRequest):
    identity, manifest, results, status = reader_manifest_service.search_book(
        filename,
        request.query,
        lid=request.lid,
        limit=request.limit,
    )
    return {
        "status": "success",
        "data": {
            "book": {
                "filename": identity["filename"],
                "lid": identity["lid"] or "",
                "extension": identity["format"],
            },
            "manifest_status": status,
            "manifest": {
                "page_count": int((manifest or {}).get("page_count") or 0),
                "section_index": (manifest or {}).get("section_index") or [],
                "toc": (manifest or {}).get("toc") or [],
            },
            "results": results,
        },
    }


@app.post("/reader/define")
def reader_define_endpoint(request: ReaderDefineRequest):
    normalized_term = str(request.term or "").strip()
    if not normalized_term:
        raise HTTPException(status_code=400, detail="Term is required")

    dictionary_entry = _lookup_dictionary_entry(normalized_term, request.language)
    fallback = {
        "term": normalized_term,
        "phonetic": "",
        "definitions": [],
        "summary": "",
    }
    if dictionary_entry:
        fallback.update(dictionary_entry)
        fallback["summary"] = dictionary_entry["definitions"][0]["definition"]
    prompt = f"""
You are defining a word for a reader inside a book app.
Return valid JSON with keys: term, phonetic, definitions, summary.
- term: normalized word
- phonetic: short pronunciation string if known
- definitions: array of up to 5 objects with part_of_speech, definition, example
- summary: one short plain-language meaning

Word: {normalized_term}
Context: {request.context or ""}
"""
    enriched = _reader_reasoning_json_fallback(prompt, fallback)
    if not enriched.get("definitions") and dictionary_entry:
        enriched["definitions"] = dictionary_entry["definitions"]
    if not enriched.get("term"):
        enriched["term"] = normalized_term
    return {"status": "success", "data": enriched}


@app.post("/reader/translate")
def reader_translate_endpoint(request: ReaderTranslateRequest):
    normalized_text = str(request.text or "").strip()
    if not normalized_text:
        raise HTTPException(status_code=400, detail="Text is required")

    public_translation = _translate_with_public_google(
        normalized_text,
        source_language=request.source_language,
        target_language=request.target_language,
    )
    fallback = {
        "translated_text": normalized_text,
        "source_language": request.source_language or "auto",
        "target_language": request.target_language or "en",
        "provider": "fallback",
    }
    if public_translation:
        return {"status": "success", "data": public_translation}

    prompt = f"""
Translate the following text.
Return valid JSON with keys: translated_text, source_language, target_language.

Source language: {request.source_language or "auto"}
Target language: {request.target_language or "en"}
Mode: {request.mode or "selection"}
Context: {request.context or ""}

Text:
{normalized_text}
"""
    translated = _reader_reasoning_json_fallback(prompt, fallback)
    return {"status": "success", "data": translated}


@app.get("/library/{filename}")
async def get_library_file(filename: str):
    file_path = os.path.join(LIBRARY_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=file_path, filename=filename, content_disposition_type="inline"
    )


@app.post("/ingest")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400)
    file_location = os.path.join(LIBRARY_DIR, file.filename)
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
        return {"info": f"file '{file.filename}' saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/brain/ingest")
async def ingest_book_endpoint(request: IngestRequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)

    target_filename = request.filename
    filepath = os.path.join(LIBRARY_DIR, target_filename)

    # --- FIX: SMART FILE RESOLVER ---
    # If the exact filename isn't found, search the folder for matching titles/extensions
    if not os.path.exists(filepath):
        found = False
        # 1. Try appending common extensions
        for ext in [".pdf", ".epub", ".txt", ".md"]:
            test_path = os.path.join(LIBRARY_DIR, target_filename + ext)
            if os.path.exists(test_path):
                filepath = test_path
                target_filename = target_filename + ext
                found = True
                break

        # 2. Deep scan: Match title ignoring spaces and underscores
        if not found:
            all_files = os.listdir(LIBRARY_DIR)
            clean_target = target_filename.lower().replace(" ", "").replace("_", "")
            for f in all_files:
                if clean_target in f.lower().replace(" ", "").replace("_", ""):
                    filepath = os.path.join(LIBRARY_DIR, f)
                    target_filename = f
                    found = True
                    break

        if not found:
            return {"error": f"Could not locate file for: {request.filename}"}

    # Use the resolved filename for the rest of the process
    request.filename = target_filename

    metadata = {
        "filename": target_filename,
        "title": target_filename,
        "author": "Unknown",
        "year": 0,
    }
    try:
        from scripts.parsers import read_any_file_metadata

        meta = read_any_file_metadata(filepath)
        if meta:
            metadata.update(meta)
    except:
        pass

    result = ingest_queue_manager.enqueue_local(request.filename, filepath, metadata)
    return result


@app.get("/brain/ingest/status")
def ingest_status_endpoint():
    return {"status": "success", "data": ingest_queue_manager.get_snapshot()}


@app.post("/brain/ingest/cancel")
def cancel_ingest_endpoint(request: CancelIngestRequest):
    result = ingest_queue_manager.cancel(
        filename=request.filename,
        job_id=request.job_id,
    )
    return {"status": result["status"], "data": result["queue"], "result": result}


@app.delete("/library/{filename}")
def delete_library_file(filename: str):
    try:
        path = os.path.join(LIBRARY_DIR, filename)
        if os.path.exists(path):
            os.remove(path)
            return {"status": "deleted"}
        return {"error": "File not found"}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/brain/{filename}")
def delete_brain_book(filename: str):
    try:
        db.delete_document(filename)
        return {"status": "deleted"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/gutenberg/search")
def search_gutenberg_endpoint(
    query: str, filter: str = "title", subject: str = None, limit: int = 25
):
    if filter == "subject":
        filter = "group"
    results = search_gutenberg(query, filter, subject=subject, limit=limit)
    return {"results": results}


@app.get("/ia/search")
async def search_ia_endpoint(request: Request):
    params = dict(request.query_params)
    page = int(params.get("page", 1))
    query = params.get("query", "")
    title = params.get("title")
    author = params.get("author")
    subject = params.get("subject")
    limit = int(params.get("limit", 20))

    results = await search_internet_archive_async(
        query=query, page=page, rows=limit, title=title, author=author, subject=subject
    )
    return results


@app.get("/discover/search_v2")
async def search_v2_endpoint(query: str = "", limit: int = 25, subject: str = None):
    logger.info(
        "Search V2 triggered %s subject=%s",
        summarize_text_for_log("query", query),
        subject or "none",
    )

    target_titles = []
    reasoning_message = ""

    if subject == "All":
        subject = None

    try:
        runtime_manager.require_roles_ready(["embedding"])
        # --- FLOW 1: MANUAL TOPIC PROVIDED ---
        if query.strip():
            logger.info(
                "Manual topic provided. Consulting recommender. %s",
                summarize_text_for_log("query", query),
            )
            reasoning_message = f"Curated selections for '{query}'"
            if subject:
                reasoning_message += f" in {subject}"

            recs = get_recommendations(limit=15, genre_filter=subject, user_query=query)

            if isinstance(recs, list) and len(recs) > 0:
                for r in recs:
                    if isinstance(r, dict) and "title" in r:
                        target_titles.append(r["title"])
            else:
                # Fallback to direct text search ONLY if the Recommender fails
                logger.warning(
                    "⚠️ Recommender yielded nothing. Falling back to direct API search."
                )
                tasks = [
                    asyncio.to_thread(
                        search_gutenberg, query, "title", subject, int(limit)
                    ),
                    search_internet_archive_async(
                        query=query, subject=subject, rows=int(limit)
                    ),
                ]
                results = await asyncio.gather(*tasks)
                combined = []
                for batch in results:
                    items = (
                        batch if isinstance(batch, list) else batch.get("results", [])
                    )
                    combined.extend(items)
                random.shuffle(combined)
                return {"results": combined[:limit], "message": reasoning_message}

        # --- FLOW 2: CONTEXTUAL DISCOVERY (NO TOPIC) ---
        else:
            logger.info("🧠 No query. Analyzing Library for context...")
            lib_path = os.path.join(BASE_DIR, "data", "library.db")
            try:
                conn = sqlite3.connect(lib_path)
                conn.row_factory = sqlite3.Row
                c = conn.cursor()
                c.execute("SELECT title FROM library_inventory")
                books = [{"title": row["title"]} for row in c.fetchall()]
                conn.close()
            except Exception as e:
                logger.error(f"Failed to load library titles: {e}")
                books = []

            if not books and subject:
                reasoning_message = f"Top rated books in {subject}"
                recs = get_recommendations(limit=15, genre_filter=subject)
                if isinstance(recs, list):
                    for r in recs:
                        if isinstance(r, dict) and "title" in r:
                            target_titles.append(r["title"])

            elif not books:
                return {
                    "results": [],
                    "message": "Library is empty and no genre selected.",
                }

            if books and not target_titles:
                stopwords = {
                    "the",
                    "of",
                    "and",
                    "a",
                    "an",
                    "in",
                    "to",
                    "for",
                    "on",
                    "guide",
                    "introduction",
                    "volume",
                    "history",
                    "edition",
                }
                keywords = []
                for b in books:
                    title_words = clean_title_for_search(b.get("title", "")).split()
                    keywords.extend(
                        [w for w in title_words if w not in stopwords and len(w) > 3]
                    )

                if keywords:
                    top_keywords = [k for k, c in Counter(keywords).most_common(3)]
                    reasoning_message = (
                        f"Based on your interest in {', '.join(top_keywords).title()}"
                    )
                    if subject:
                        reasoning_message += f" (Filtered by {subject})"

                    recs = get_recommendations(limit=15, genre_filter=subject)
                    if isinstance(recs, list):
                        for r in recs:
                            if isinstance(r, dict) and "title" in r:
                                target_titles.append(r["title"])

        # --- RESOLUTION PHASE ---
        if not target_titles:
            return {
                "results": [],
                "message": f"No recommendations found. {reasoning_message}",
            }

        target_titles = list(set(target_titles))
        random.shuffle(target_titles)
        target_titles = target_titles[:15]

        logger.info(f"🎯 Resolving {len(target_titles)} recommended titles...")

        tasks = []
        for title in target_titles:
            if not title:
                continue
            tasks.append(
                asyncio.to_thread(search_gutenberg, title, "title", subject, 1)
            )
            tasks.append(
                search_internet_archive_async(title=title, subject=subject, rows=1)
            )

        resolution_results = await asyncio.gather(*tasks)
        final_results = []
        seen_ids = set()

        for batch in resolution_results:
            items = batch if isinstance(batch, list) else batch.get("results", [])
            for item in items:
                if item["id"] not in seen_ids:
                    item["recommendation_reason"] = reasoning_message
                    final_results.append(item)
                    seen_ids.add(item["id"])

        return {"results": final_results[:limit], "message": reasoning_message}

    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Search V2 Failed: {e}")
        return {"results": [], "error": str(e)}


# Make sure to import it at the top of api.py if you haven't already:
# from scripts.library_maintenance import refresh_library_files


@app.post("/library/clean_local")
async def clean_local_endpoint(background_tasks: BackgroundTasks):
    async def task():
        try:
            logger.info("🧹 Phase 1: Registering physical files...")
            await asyncio.to_thread(refresh_library_files)
            logger.info("✅ Local Library Clean Complete!")
            await manager.broadcast(
                {"status": "cleanup_complete", "result": "Local Cleaned"}
            )
        except Exception as e:
            logger.error(f"Cleanup Error: {e}")
            await manager.broadcast({"status": "error", "message": str(e)})

    background_tasks.add_task(task)
    return {"status": "started", "message": "Local Library Clean started."}


@app.post("/library/hydrate_api")
async def hydrate_api_endpoint(background_tasks: BackgroundTasks):
    async def task():
        try:
            logger.info("📡 Phase 2: Running API Hydration...")
            await asyncio.to_thread(scripts.hydrator.hydrate_entire_library)
            logger.info("✅ API Hydration Complete!")
            await manager.broadcast(
                {"status": "hydration_complete", "result": "Hydrated"}
            )
        except Exception as e:
            logger.error(f"Hydration Error: {e}")
            await manager.broadcast({"status": "error", "message": str(e)})

    background_tasks.add_task(task)
    return {"status": "started", "message": "API Hydration started."}


@app.post("/recommender/vectorize")
async def vectorize_registry_endpoint(background_tasks: BackgroundTasks):
    try:
        runtime_manager.require_roles_ready(["embedding"])
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)

    async def task():
        try:
            logger.info("Starting Registry Vectorization...")
            result = await asyncio.to_thread(
                vectorize_registry,
                lambda payload: broadcast_app_event(
                    {"type": "VECTORIZE_PROGRESS", "data": payload}
                ),
            )
            logger.info(f"Vectorization Complete: {result}")
            await manager.broadcast({"status": "vectorize_complete", "result": result})
        except Exception as e:
            logger.error(f"Vectorization Error: {e}")
            await manager.broadcast({"status": "error", "message": str(e)})

    background_tasks.add_task(task)
    return {
        "status": "started",
        "message": "Registry Vectorization started in background.",
    }


@app.post("/recommender/vectorize/stop")
def stop_vectorization_endpoint():
    result = stop_vectorization()
    return result


@app.post("/recommender/sync")
def sync_crawler_data():
    try:
        result = ingest_csvs()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/recommender/suggest")
def suggest_books(filter: str = Query("All", description="Genre filter")):
    try:
        runtime_manager.require_roles_ready(["embedding"])
        results = get_recommendations(limit=100, genre_filter=filter)
        if isinstance(results, dict) and "error" in results:
            return {"status": "error", "message": results["error"], "books": []}

        books = []
        if isinstance(results, list):
            for r in results:
                if isinstance(r, dict):
                    books.append(
                        {
                            "id": r.get("lid", ""),
                            "title": r.get("title", "Unknown"),
                            "author": r.get("author", "Unknown"),
                            "rating": r.get("rating", 0),
                            "year": r.get("year", 0),
                            "similarity": 1.0 - r.get("_distance", 0.0),
                        }
                    )
        return {"status": "success", "books": books}
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Recommendation failed: {e}")
        return {"status": "error", "message": str(e), "books": []}


@app.post("/gutenberg/download")
def download_gutenberg(request: GutenbergRequest, background_tasks: BackgroundTasks):
    async def task():
        try:
            fname = await asyncio.to_thread(
                download_book, request.book_id, request.title, request.preferred_format
            )
            await manager.broadcast(
                {"type": "DOWNLOAD_COMPLETE", "filename": fname, "id": request.book_id}
            )
        except:
            pass

    background_tasks.add_task(task)
    return {"status": "started"}


@app.post("/ia/download")
def download_ia(request: IARequest, background_tasks: BackgroundTasks):
    async def task():
        try:
            fname = await asyncio.to_thread(
                download_ia_item,
                request.identifier,
                request.title,
                request.preferred_format,
            )
            await manager.broadcast(
                {
                    "type": "DOWNLOAD_COMPLETE",
                    "filename": fname,
                    "id": request.identifier,
                }
            )
        except:
            pass

    background_tasks.add_task(task)
    return {"status": "started"}


@app.post("/gutenberg/ingest-direct")
def ingest_direct(request: GutenbergRequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)

    return ingest_queue_manager.enqueue_remote_download(
        kind="gutenberg",
        source_id=request.book_id,
        title=request.title,
        author=request.author,
        year=request.year,
        preferred_format=request.preferred_format,
    )


@app.post("/ia/ingest")
def ingest_direct_ia(request: IARequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
    except RuntimeNotReadyError as error:
        return runtime_error_response(error)

    return ingest_queue_manager.enqueue_remote_download(
        kind="internet_archive",
        source_id=request.identifier,
        title=request.title,
        author=request.author,
        year=request.year,
        preferred_format=request.preferred_format,
    )


@app.post("/recommender/resolve")
async def resolve_recommender_item(request: ResolveRequest):
    try:
        search_query = clean_title_for_search(request.title)
        logger.info(
            "Resolving recommender item title_chars=%s normalized_chars=%s",
            len(str(request.title or "").strip()),
            len(search_query),
        )
        task_gutenberg = asyncio.to_thread(
            search_gutenberg, search_query, "title", None, 1
        )
        task_ia = search_internet_archive_async(query=search_query, rows=1)
        results_gut, results_ia = await asyncio.gather(task_gutenberg, task_ia)
        combined = []
        if isinstance(results_gut, list):
            combined.extend(results_gut)
        if isinstance(results_ia, dict) and "results" in results_ia:
            combined.extend(results_ia["results"])
        return {"results": combined}
    except Exception as e:
        logger.error(f"Resolve Failed: {e}")
        return {"results": [], "error": str(e)}


@app.post("/discover/from_highlight")
def discover_from_highlight(request: EchoContextRequest):
    try:
        runtime_manager.require_roles_ready(["embedding"])
        logger.info(
            "Highlight discovery triggered %s",
            summarize_text_for_log("highlight", request.text),
        )
        vec = get_embedding(request.text)

        registry_res = db.search(vec, limit=15, table_name="registry_vectors")

        suggestions = []
        seen = set()

        for r in registry_res:
            title = r.get("title", "Unknown")
            if title in seen:
                continue
            seen.add(title)

            suggestions.append(
                {
                    "id": r.get("lid", ""),
                    "title": title,
                    "author": r.get("author", "Unknown"),
                    "year": r.get("year", 0),
                    "similarity": int((1 / (1 + r.get("_distance", 0.5))) * 100),
                    "description": r.get("text", "")[:300] + "...",
                }
            )

        suggestions.sort(key=lambda x: x["similarity"], reverse=True)
        return {
            "status": "success",
            "recommendations": suggestions[:5],
        }

    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Highlight Discovery Error: {e}")
        return {"status": "error", "message": str(e)}

    # --- THE COGNITIVE GRAPH ENDPOINTS ---


@app.get("/graph/core")
def graph_core_endpoint():
    """Returns the entire physical library and custom nodes to render the canvas."""
    try:
        graph_data = get_core_graph()
        return {"status": "success", "data": graph_data}
    except Exception as e:
        logger.error(f"Graph Core Error: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/graph/edge/add")
def add_edge_endpoint(request: GraphEdgeRequest):
    """Saves a permanent connection between two books/concepts."""
    result = add_custom_edge(
        request.source_id,
        request.target_id,
        request.edge_type,
        request.context_text,
        request.weight,
    )
    return result


@app.post("/graph/node/add")
def add_node_endpoint(request: GraphNodeRequest):
    """Creates a new Concept Hub or Note on the canvas."""
    result = add_custom_node(
        request.node_id, request.label, request.node_type, request.description
    )
    return result


@app.post("/brain/echo/save")
def save_echo_endpoint(request: EchoSaveRequest):
    """Phase 2: Semantic Clustering (Relational Graph Approach with Dual-Anchors)"""
    try:
        runtime_manager.require_roles_ready(["embedding"])
        import uuid

        from scripts.db_manager import graph_db
        from scripts.vectorize import get_embedding

        # --- THE FIX: Backend Auto-Resolver ---
        resolved_library_id = request.library_id

        if not resolved_library_id:
            import sqlite3

            from scripts.db_manager import LIBRARY_DB_PATH, db

            # 1. Try to resolve the hard ID from LanceDB using the filename
            try:
                brain_records = db.get_all_books()
                for b in brain_records:
                    if (
                        b.get("filename") == request.book_id
                        or b.get("title") == request.book_id
                    ):
                        resolved_library_id = b.get(
                            "book_id"
                        )  # This is the lib_ hash in Lance
                        break
            except Exception:
                pass

            # 2. If LanceDB misses, resolve directly from the Central Registry
            if not resolved_library_id:
                try:
                    conn = sqlite3.connect(LIBRARY_DB_PATH)
                    c = conn.cursor()
                    clean_query = (
                        request.book_id.replace(".epub", "")
                        .replace(".pdf", "")
                        .replace(".txt", "")
                    )
                    c.execute(
                        "SELECT lid FROM library_inventory WHERE title LIKE ? OR file_path LIKE ?",
                        (f"%{clean_query}%", f"%{request.book_id}%"),
                    )
                    row = c.fetchone()
                    if row:
                        resolved_library_id = row[0]
                    conn.close()
                except Exception:
                    pass
        # --------------------------------------

        # Check for active cluster using the newly resolved ID
        cluster_id = (request.cluster_id or "").strip()
        if not cluster_id:
            cluster_id = graph_db.get_active_cluster(
                resolved_library_id, request.book_id
            )
        if not cluster_id:
            cluster_id = f"cluster_{uuid.uuid4().hex[:8]}"
            logger.info(f"🌱 Spawning new Thought Cluster: {cluster_id}")
            # Save BOTH the string and the resolved hard ID to the database!
            graph_db.create_cluster(
                cluster_id, request.book_id, library_id=resolved_library_id
            )

        c = graph_db.conn.cursor()
        c.execute(
            "SELECT echo_id, ai_insight FROM user_echoes WHERE cluster_id = ?",
            (cluster_id,),
        )
        existing_echoes = [dict(row) for row in c.fetchall()]

        new_vec = get_embedding(request.ai_insight)
        best_match_id = None
        best_score = 0.0

        if new_vec and existing_echoes:
            new_vec_np = np.array(new_vec)
            new_vec_norm = np.linalg.norm(new_vec_np)
            for echo in existing_echoes:
                ext_vec = get_embedding(echo["ai_insight"])
                if ext_vec:
                    ext_vec_np = np.array(ext_vec)
                    score = np.dot(new_vec_np, ext_vec_np) / (
                        new_vec_norm * np.linalg.norm(ext_vec_np)
                    )
                    if score > best_score:
                        best_score = score
                        best_match_id = echo["echo_id"]

        source_data = {
            "highlight": request.highlight,
            "context": request.context,
            "filename": request.filename,
            "source_lid": request.source_lid,
            "original_chunk_id": request.original_chunk_id,
            "source_chunk_ref": request.source_chunk_ref,  # <--- NEW V2 FIELD
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        new_echo_id = f"echo_{uuid.uuid4().hex[:8]}"

        new_echo_id = f"echo_{uuid.uuid4().hex[:8]}"
        graph_db.save_compound_echo(
            echo_id=new_echo_id,
            cluster_id=cluster_id,
            ai_insight=request.ai_insight,
            sources_list=[source_data],
            weight=1,
            title=request.title,
        )

        if best_match_id and best_score >= 0.85:
            logger.info(
                f"🔗 High semantic match detected ({best_score:.2f}). Linking unique echoes."
            )
            graph_db.add_edge(
                source_id=new_echo_id,
                target_id=best_match_id,
                edge_type="compound_link",
                context_text=f"Semantic Match: {int(best_score * 100)}%",
                weight=float(best_score),
            )
            return {
                "status": "success",
                "action": "linked",
                "echo_id": new_echo_id,
                "cluster_id": cluster_id,
                "linked_to": best_match_id,
            }
        else:
            return {
                "status": "success",
                "action": "created",
                "echo_id": new_echo_id,
                "cluster_id": cluster_id,
            }

    except RuntimeNotReadyError as error:
        return runtime_error_response(error)
    except Exception as e:
        logger.error(f"Failed to save echo: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/echo/delete")
def delete_echo_endpoint(request: EchoDeleteRequest):
    """Permanently deletes an echo and removes its lines from the MindMap."""
    try:
        from scripts.db_manager import graph_db

        c = graph_db.conn.cursor()

        # Delete the actual data
        c.execute("DELETE FROM user_echoes WHERE echo_id = ?", (request.echo_id,))
        # Remove it from the physics canvas nodes
        c.execute("DELETE FROM user_nodes WHERE node_id = ?", (request.echo_id,))
        # Sever any structural lines attached to it
        c.execute(
            "DELETE FROM user_edges WHERE source_id = ? OR target_id = ?",
            (request.echo_id, request.echo_id),
        )

        graph_db.conn.commit()
        logger.info(f"🗑️ Successfully deleted Echo: {request.echo_id}")
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Failed to delete echo: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/canvas/metadata/save")
def save_spatial_metadata_endpoint(request: SpatialMetadataBulkRequest):
    """
    Saves the X/Y coordinates and orientation for canvas items (Echoes, Notes, or Archives).
    """
    try:
        from scripts.db_manager import graph_db

        for item in request.items:
            graph_db.upsert_spatial_metadata(
                item_id=item.item_id,
                item_type=item.item_type,
                x_coord=item.x_coord,
                y_coord=item.y_coord,
                orientation=item.orientation,
                z_index=item.z_index,  # <-- NEW
            )

        return {
            "status": "success",
            "message": f"Successfully saved metadata for {len(request.items)} items.",
        }
    except Exception as e:
        import logging

        logging.error(f"Canvas Metadata Save Failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/cluster/spawn")
def spawn_cluster_endpoint(request: ClusterSpawnRequest):
    try:
        new_id = f"cluster_{uuid.uuid4().hex[:8]}"
        origin_context = {
            key: value
            for key, value in dict(request.origin_context or {}).items()
            if value not in (None, "")
        }
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        column_metadata = {}
        if origin_context:
            origin_context["saved_at"] = now
            column_metadata = {
                "column_kind": "branch",
                "origin_context": origin_context,
                "source_contexts": [origin_context],
                "source_anchor_ids": [
                    value
                    for value in [str(request.parent_cluster_id or "").strip()]
                    if value
                ],
                "source_echo_ids": [
                    value
                    for value in [str(request.source_echo_id or "").strip()]
                    if value
                ],
                "updated_at": now,
            }
        graph_db.create_cluster(
            new_id,
            request.book_id,
            request.parent_cluster_id,
            request.library_id,
            source_echo_id=(request.source_echo_id or "").strip() or None,
            title=(request.title or "").strip() or None,
            is_active=bool(request.make_active),
            column_metadata=column_metadata,
        )

        source_echo_id = str(request.source_echo_id or "").strip()
        if source_echo_id and str(origin_context.get("text") or "").strip():
            existing_metadata = graph_db.get_echo_analysis_metadata(source_echo_id)
            saved_markers = list(existing_metadata.get("saved_markers") or [])
            marker = dict(origin_context.get("marker") or {})
            marker_id = str(marker.get("marker_id") or f"marker_{uuid.uuid4().hex[:8]}")
            marker["marker_id"] = marker_id
            marker["quote"] = str(marker.get("quote") or origin_context.get("text") or "")
            marker["linked_cluster_id"] = new_id
            marker["mode"] = "branch"
            marker["saved_at"] = now
            marker["source_context_title"] = str(origin_context.get("title") or "")
            existing_metadata["saved_markers"] = [
                marker,
                *[
                    existing_marker
                    for existing_marker in saved_markers
                    if str(existing_marker.get("marker_id") or "") != marker_id
                ],
            ][:32]
            graph_db.update_echo_analysis_metadata(source_echo_id, existing_metadata)
        return {"status": "success", "cluster_id": new_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/brain/cluster/activate")
def activate_cluster_endpoint(request: ClusterActivateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.set_active_cluster(
            request.cluster_id, request.book_id, request.library_id
        )
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/group")
def archive_items_group_endpoint(request: ArchiveGroupRequest):
    """
    Groups selected root items into an archive folder OR scattered items into a sub-folder.
    """
    try:
        import logging

        from scripts.db_manager import graph_db

        if not request.items:
            return {"status": "error", "message": "No items provided for archiving."}

        if request.parent_id:
            # THE NEW FLOW: Archiving Scattered Cards
            archive_id = graph_db.archive_scattered_items(
                item_ids=request.items, parent_cluster_id=request.parent_id
            )
            logging.info(
                f"🗂️ Successfully archived {len(request.items)} scattered items into Folder {archive_id}"
            )
        else:
            # THE ORIGINAL FLOW: Archiving Root Slots
            archive_id = graph_db.archive_items_group(
                item_ids=request.items, group_type=request.type
            )
            logging.info(
                f"🗂️ Successfully archived {len(request.items)} root {request.type} items into {archive_id}"
            )

        return {
            "status": "success",
            "message": f"Successfully archived {len(request.items)} items.",
            "archive_id": archive_id,
        }
    except Exception as e:
        import logging

        logging.error(f"Archiving Failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/scattered")
def archive_scattered_items(req: SubArchiveRequest):
    try:
        import logging

        from scripts.db_manager import graph_db

        # Bridge legacy requests until Frontend Phase 3 is complete
        owner_id = req.owner_item_id or req.parent_stack_id
        owner_type = req.owner_item_type or (
            "cluster" if req.canvas_mode == "ECHO" else "stack"
        )

        new_folder_id = graph_db.archive_scattered_items(
            item_ids=req.items,
            owner_item_id=owner_id,
            owner_item_type=owner_type,
            display_parent_id=req.display_parent_id,
            restore_group_id=req.restore_group_id,
            title=req.title,
        )

        return {"status": "success", "folder_id": new_folder_id}
    except Exception as e:
        logger.error(f"Error sub-archiving items: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/append")
def append_items_to_archive_endpoint(request: ArchiveAppendRequest):
    try:
        from scripts.db_manager import graph_db

        result = graph_db.append_items_to_archive(
            target_archive_id=request.target_archive_id,
            item_ids=request.item_ids,
        )
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Error appending items to archive: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/ungroup")
def unarchive_items_group_endpoint(request: UnarchiveGroupRequest):
    """Dissolves an archive folder and returns items to the canvas/parent."""
    try:
        import logging

        from scripts.db_manager import graph_db

        # Add support for Inner Archives
        if request.type == "INNER_ARCHIVE":
            graph_db.dissolve_inner_archive(request.archive_id)
        else:
            graph_db.unarchive_items_group(
                archive_id=request.archive_id, group_type=request.type
            )

        logging.info(f"📂 Successfully unarchived group: {request.archive_id}")
        return {"status": "success"}
    except Exception as e:
        import logging

        logging.error(f"Unarchiving Failed: {e}")
        return {"status": "error", "message": str(e)}


# --- NEW STACK ENDPOINTS ---
@app.post("/notes/stacks/create")
def create_note_stack_endpoint(request: NoteStackCreateRequest):
    try:
        from scripts.db_manager import graph_db

        stack_id = f"stack_{uuid.uuid4().hex[:8]}"
        graph_db.create_note_stack(stack_id, request.title)
        return {"status": "success", "stack_id": stack_id, "title": request.title}
    except Exception as e:
        logger.error(f"Error Creating Stack: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/notes/stacks")
def get_note_stacks_endpoint():
    try:
        from scripts.db_manager import graph_db

        stacks = graph_db.get_all_note_stacks()
        return {"status": "success", "data": stacks}
    except Exception as e:
        logger.error(f"Error Fetching Stacks: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/notes/stacks/{stack_id}")
def delete_note_stack_endpoint(stack_id: str):
    try:
        from scripts.db_manager import graph_db

        graph_db.delete_note_stack(stack_id)
        return {"status": "success", "message": f"Stack {stack_id} deleted."}
    except Exception as e:
        logger.error(f"Error Deleting Stack: {e}")
        return {"status": "error", "message": str(e)}


# --- UPDATED GROUP CREATION ENDPOINT ---
@app.post("/notes/groups/create")
def create_note_group_endpoint(request: NoteGroupCreateRequest):
    try:
        from scripts.db_manager import graph_db

        group_id = f"grp_{uuid.uuid4().hex[:8]}"
        graph_db.create_note_group(
            group_id, request.title, request.stack_id, request.linked_book_id
        )
        return {"status": "success", "group_id": group_id, "title": request.title}
    except Exception as e:
        logger.error(f"Error Creating Group: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/notes/groups")
def get_note_groups_endpoint():
    try:
        from scripts.db_manager import graph_db

        groups = graph_db.get_all_note_groups()
        return {"status": "success", "data": groups}
    except Exception as e:
        logger.error(f"Error Fetching Groups: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/notes/item/create")
def create_note_item_endpoint(request: NoteItemCreateRequest):
    try:
        from scripts.db_manager import graph_db

        note_id = f"note_{uuid.uuid4().hex[:8]}"
        graph_db.create_note(
            note_id,
            request.group_id,
            request.title,
            request.content,
            request.tags,
            request.linked_echo_id,  # <--- Safely passes the new variable
        )
        return {"status": "success", "note_id": note_id}
    except Exception as e:
        logger.error(f"Error Creating Note: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/notes/item/{group_id}")
def get_notes_for_group_endpoint(group_id: str):
    try:
        from scripts.db_manager import graph_db

        notes = graph_db.get_notes_by_group(group_id)
        return {"status": "success", "data": notes}
    except Exception as e:
        logger.error(f"Error Fetching Notes: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/notes/groups/{group_id}")
def delete_note_group_endpoint(group_id: str):
    try:
        from scripts.db_manager import graph_db

        graph_db.delete_note_group(group_id)
        return {
            "status": "success",
            "message": f"Group {group_id} deleted successfully.",
        }
    except Exception as e:
        logger.error(f"Error Deleting Group: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/brain/archive/inner/{archive_id}")
def delete_empty_inner_archive_endpoint(archive_id: str):
    try:
        from scripts.db_manager import graph_db

        deleted = graph_db.delete_empty_inner_archive(archive_id)
        if not deleted:
            return {
                "status": "error",
                "message": "Only empty inner archive folders can be deleted.",
            }
        return {"status": "success", "archive_id": archive_id}
    except Exception as e:
        logger.error(f"Error Deleting Empty Inner Archive: {e}")
        return {"status": "error", "message": str(e)}


@app.delete("/notes/item/{note_id}")
def delete_note_item_endpoint(note_id: str):
    try:
        from scripts.db_manager import graph_db

        graph_db.delete_note(note_id)
        return {"status": "success", "message": f"Note {note_id} deleted successfully."}
    except Exception as e:
        logger.error(f"Error Deleting Note: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/notes/item/update")
def update_note_item_endpoint(request: NoteItemUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        # Pass the group_id to the DB manager
        graph_db.update_note(
            request.note_id,
            request.title,
            request.content,
            request.tags,
            request.group_id,
        )
        return {"status": "success", "note_id": request.note_id}
    except Exception as e:
        logger.error(f"Error Updating Note: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/brain/tags/update")
def update_tags_endpoint(request: TagUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_tags(request.item_id, request.tags, request.item_type)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error Updating Tags: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/echo/link_note")
def link_note_to_echo_endpoint(request: LinkNoteEchoRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.link_note_to_echo(request.note_id, request.echo_id)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/brain/links/link")
def link_spatial_items_endpoint(request: SpatialLinkRequest):
    try:
        from scripts.db_manager import graph_db

        result = graph_db.link_items(request.item_ids)
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Spatial link failed: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/links/unlink")
def unlink_spatial_items_endpoint(request: SpatialLinkRequest):
    try:
        from scripts.db_manager import graph_db

        result = graph_db.unlink_items(request.item_ids)
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Spatial unlink failed: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/brain/quick_thoughts/update")
def update_quick_thoughts_endpoint(request: QuickThoughtsRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_quick_thoughts(
            request.item_id, request.thoughts, request.item_type
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error Updating Quick Thoughts: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/brain/echo/{echo_id}")
def get_echo_by_id(echo_id: str):
    try:
        from scripts.db_manager import graph_db

        c = graph_db.conn.cursor()
        # Fetch the echo AND its parent cluster's column name
        c.execute(
            """
            SELECT e.*, c.book_id as column_name
            FROM user_echoes e
            LEFT JOIN echo_clusters c ON e.cluster_id = c.cluster_id
            WHERE e.echo_id = ?
        """,
            (echo_id,),
        )
        row = c.fetchone()
        if row:
            import json

            sources = json.loads(row["sources"]) if row["sources"] else []
            linked_notes = graph_db.get_linked_notes_for_echo(echo_id)
            return {
                "status": "success",
                "data": {
                    "echo_id": row["echo_id"],
                    "ai_insight": row["ai_insight"],
                    "title": row["title"],
                    "sources": sources,
                    "analysis_metadata": (
                        json.loads(row["analysis_metadata"])
                        if row["analysis_metadata"]
                        else {}
                    ),
                    "linked_note_id": row["linked_note_id"],
                    "linked_notes": linked_notes,
                    "column_name": row["column_name"],  # <--- Sent to UI
                },
            }
        return {"status": "error", "message": "Not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


print(">>> NEW MEDIA ENDPOINT SUCCESSFULLY REGISTERED <<<")


@app.post("/upload/media/{item_type}/{item_id}")
async def upload_media_file(
    request: Request,
    item_type: str,
    item_id: str,
    file: UploadFile = File(...),
):
    try:
        import os
        import shutil
        import uuid

        from fastapi import HTTPException

        file_extension = os.path.splitext(file.filename)[1].lower()

        media_bucket = "echoes" if item_type == "echo" else "notes"

        # Build strict nested folders: stored_files/<bucket>/<id>/
        target_dir = os.path.join(UPLOAD_DIR, media_bucket, item_id)
        os.makedirs(target_dir, exist_ok=True)

        # If it's a stack or cluster cover, delete the old one first
        if item_type in ["stack", "cluster"]:
            for existing_file in os.listdir(target_dir):
                if existing_file.lower().endswith(
                    (
                        ".png",
                        ".jpg",
                        ".jpeg",
                        ".gif",
                        ".webp",
                        ".mp4",
                        ".webm",
                        ".mp3",
                        ".wav",
                    )
                ):
                    os.remove(os.path.join(target_dir, existing_file))
            unique_filename = f"cover{file_extension}"
        else:
            # For BlockNote, append infinitely
            unique_filename = f"{uuid.uuid4()}{file_extension}"

        file_path = os.path.join(target_dir, unique_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_url = str(
            request.url_for(
                "files", path=f"{media_bucket}/{item_id}/{unique_filename}"
            )
        )

        if item_type == "stack":
            from scripts.db_manager import graph_db

            graph_db.update_stack_cover(item_id, file_url)
        elif item_type == "cluster":
            from scripts.db_manager import graph_db

            graph_db.update_cluster_cover(item_id, file_url)
        elif item_type == "echo":
            from scripts.db_manager import graph_db

            existing_metadata = graph_db.get_echo_analysis_metadata(item_id)
            attached_images = [
                str(url).strip()
                for url in list(existing_metadata.get("attached_images") or [])
                if str(url).strip()
            ]
            if file_url not in attached_images:
                attached_images.append(file_url)
            existing_metadata["attached_images"] = attached_images
            graph_db.update_echo_analysis_metadata(item_id, existing_metadata)
            return {"url": file_url, "analysis_metadata": existing_metadata}

        return {"url": file_url}

    except Exception as e:
        logger.error(f"Media Upload Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/notes/item/single/{note_id}")
def get_single_note_endpoint(note_id: str):
    try:
        from scripts.db_manager import graph_db

        c = graph_db.conn.cursor()
        c.execute("SELECT * FROM user_notes WHERE note_id = ?", (note_id,))
        row = c.fetchone()
        if row:
            return {"status": "success", "data": dict(row)}
        return {"status": "error", "message": "Not found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.put("/notes/stacks/update")
def update_note_stack_endpoint(request: NoteStackUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_note_stack_title(request.stack_id, request.title)
        return {"status": "success", "stack_id": request.stack_id}
    except Exception as e:
        logger.error(f"Error Updating Stack: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/notes/groups/update")
def update_note_group_endpoint(request: NoteGroupUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_note_group_title(request.group_id, request.title)
        return {"status": "success", "group_id": request.group_id}
    except Exception as e:
        logger.error(f"Error Updating Group: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/brain/cluster/update_title")
def update_cluster_title_endpoint(request: ClusterTitleUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_cluster_title(request.cluster_id, request.title)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.delete("/brain/cluster/{cluster_id}")
def delete_cluster_endpoint(cluster_id: str):
    try:
        from scripts.db_manager import graph_db

        graph_db.delete_cluster(cluster_id)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.put("/brain/cluster/layout")
def update_cluster_layout_endpoint(request: ClusterLayoutUpdateRequest):
    try:
        import json

        from scripts.db_manager import graph_db

        layout_dicts = [
            {"type": item.type, "id": item.id} for item in request.orbit_layout
        ]
        layout_json = json.dumps(layout_dicts)
        graph_db.update_cluster_orbit_layout(request.cluster_id, layout_json)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/brain/cluster/orbit_metadata")
def save_orbit_metadata_endpoint(request: OrbitMetadataRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.save_bulk_orbit_metadata([item.dict() for item in request.metadata])
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/scattered/remove")
def remove_scattered_items(req: RemoveScatteredRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.remove_scattered_items(req.items)
        return {"status": "success"}
    except Exception as e:
        import logging

        logging.error(f"Error removing scattered items: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/brain/archive/ungroup/items")
def unarchive_specific_items_endpoint(request: UnarchiveSpecificRequest):
    """Pulls specific individual items out of an Outer Archive."""
    try:
        from scripts.db_manager import graph_db

        graph_db.unarchive_specific_root_items(request.items, request.type)
        return {"status": "success"}
    except Exception as e:
        import logging

        logging.error(f"Specific Unarchiving Failed: {e}")
        return {"status": "error", "message": str(e)}


@app.put("/brain/archive/update_title")
def update_outer_archive_title_endpoint(request: ArchiveTitleUpdateRequest):
    try:
        from scripts.db_manager import graph_db

        graph_db.update_outer_archive_title(
            request.archive_id, request.title, request.type
        )
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
