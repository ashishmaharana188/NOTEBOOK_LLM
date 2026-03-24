import logging
import os
import threading
import time
import uuid
from collections import deque
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

from scripts.ingestor import IngestCancelledError, process_book_task
from scripts.librarian import download_book, download_ia_item
from scripts.model_runtime import RuntimeNotReadyError, runtime_manager

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY_DIR = os.path.join(BASE_DIR, "data", "library")


class IngestQueueManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._broadcast: Optional[Callable[[Dict[str, Any]], None]] = None
        self._queue: Deque[Dict[str, Any]] = deque()
        self._current_job: Optional[Dict[str, Any]] = None
        self._wake_event = threading.Event()
        self._stop_event = threading.Event()
        self._worker = threading.Thread(
            target=self._worker_loop,
            name="ingest-queue-worker",
            daemon=True,
        )
        self._worker.start()

    def set_broadcaster(self, callback: Callable[[Dict[str, Any]], None]):
        self._broadcast = callback

    def _emit(self, message: Dict[str, Any]):
        if self._broadcast:
            try:
                self._broadcast(message)
            except Exception as error:
                logger.warning(f"Failed to broadcast ingest queue event: {error}")

    def _serialize_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "job_id": job["job_id"],
            "kind": job["kind"],
            "source": job["source"],
            "status": job["status"],
            "cancel_requested": bool(job.get("cancel_requested_at")),
            "phase": job.get("phase") or "queued",
            "progress": int(job.get("progress") or 0),
            "chunk_total": job.get("chunk_total"),
            "embedded_chunks": job.get("embedded_chunks"),
            "filename": job.get("filename") or "",
            "title": job.get("title") or job.get("filename") or "",
            "downloaded_filename": job.get("downloaded_filename") or "",
            "created_at": job.get("created_at"),
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "error": job.get("error"),
        }

    def _snapshot_locked(self) -> Dict[str, Any]:
        current = (
            self._serialize_job(self._current_job)
            if self._current_job and self._current_job.get("status") == "running"
            else None
        )
        queued = [self._serialize_job(job) for job in list(self._queue)]
        return {
            "current": current,
            "queued": queued,
            "counts": {
                "active": 1 if current else 0,
                "queued": len(queued),
                "total": len(queued) + (1 if current else 0),
            },
            "updated_at": time.time(),
        }

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return self._snapshot_locked()

    def _publish_snapshot_locked(self) -> Dict[str, Any]:
        snapshot = self._snapshot_locked()
        self._emit({"type": "INGEST_QUEUE_STATE", "data": snapshot})
        return snapshot

    def _job_matches(
        self,
        job: Dict[str, Any],
        filename: Optional[str] = None,
        job_id: Optional[str] = None,
        dedupe_key: Optional[str] = None,
    ) -> bool:
        if job_id and job.get("job_id") == job_id:
            return True
        if dedupe_key and job.get("dedupe_key") == dedupe_key:
            return True
        if not filename:
            return False

        filename_l = filename.lower()
        candidates = [
            job.get("filename"),
            job.get("downloaded_filename"),
            job.get("title"),
        ]
        return any(
            isinstance(candidate, str) and candidate.lower() == filename_l
            for candidate in candidates
            if candidate
        )

    def _find_existing_locked(
        self, filename: Optional[str] = None, dedupe_key: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        if self._current_job and self._job_matches(
            self._current_job, filename=filename, dedupe_key=dedupe_key
        ):
            return self._current_job

        for job in self._queue:
            if self._job_matches(job, filename=filename, dedupe_key=dedupe_key):
                return job
        return None

    def _build_job(
        self,
        *,
        kind: str,
        source: str,
        filename: str,
        title: Optional[str] = None,
        file_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        source_id: Optional[str] = None,
        preferred_format: Optional[str] = None,
    ) -> Dict[str, Any]:
        job_title = title or filename
        dedupe_key = (
            f"{kind}:{source_id}"
            if source_id
            else f"{kind}:{filename.lower()}"
        )
        return {
            "job_id": f"ingest_{uuid.uuid4().hex[:10]}",
            "kind": kind,
            "source": source,
            "source_id": source_id,
            "preferred_format": preferred_format,
            "filename": filename,
            "title": job_title,
            "file_path": file_path,
            "metadata": metadata or {},
            "status": "queued",
            "phase": "queued",
            "progress": 0,
            "chunk_total": None,
            "embedded_chunks": None,
            "created_at": time.time(),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "downloaded_filename": None,
            "cancel_event": threading.Event(),
            "cancel_requested_at": None,
            "dedupe_key": dedupe_key,
        }

    def enqueue_local(
        self, filename: str, file_path: str, metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        with self._lock:
            existing = self._find_existing_locked(filename=filename)
            if existing:
                snapshot = self._publish_snapshot_locked()
                return {
                    "status": "already_queued",
                    "job": self._serialize_job(existing),
                    "queue": snapshot,
                }

            job = self._build_job(
                kind="local",
                source="library",
                filename=filename,
                title=metadata.get("title") or filename,
                file_path=file_path,
                metadata=metadata,
            )
            self._queue.append(job)
            snapshot = self._publish_snapshot_locked()
            self._wake_event.set()

        self._emit(
            {
                "type": "INGEST_QUEUED",
                "job": self._serialize_job(job),
                "data": snapshot,
            }
        )
        return {"status": "queued", "job": self._serialize_job(job), "queue": snapshot}

    def enqueue_remote_download(
        self,
        *,
        kind: str,
        source_id: str,
        title: str,
        author: str,
        year: int,
        preferred_format: str,
    ) -> Dict[str, Any]:
        with self._lock:
            existing = self._find_existing_locked(
                filename=title,
                dedupe_key=f"{kind}:{source_id}",
            )
            if existing:
                snapshot = self._publish_snapshot_locked()
                return {
                    "status": "already_queued",
                    "job": self._serialize_job(existing),
                    "queue": snapshot,
                }

            job = self._build_job(
                kind=kind,
                source="remote",
                source_id=source_id,
                filename=title,
                title=title,
                metadata={
                    "title": title,
                    "author": author,
                    "year": year,
                },
                preferred_format=preferred_format,
            )
            self._queue.append(job)
            snapshot = self._publish_snapshot_locked()
            self._wake_event.set()

        self._emit(
            {
                "type": "INGEST_QUEUED",
                "job": self._serialize_job(job),
                "data": snapshot,
            }
        )
        return {"status": "queued", "job": self._serialize_job(job), "queue": snapshot}

    def cancel(
        self, filename: Optional[str] = None, job_id: Optional[str] = None
    ) -> Dict[str, Any]:
        removed: List[Dict[str, Any]] = []
        current_cancelled = None

        with self._lock:
            next_queue: Deque[Dict[str, Any]] = deque()
            for job in self._queue:
                if self._job_matches(job, filename=filename, job_id=job_id):
                    job["status"] = "cancelled"
                    job["completed_at"] = time.time()
                    removed.append(job)
                else:
                    next_queue.append(job)
            self._queue = next_queue

            if self._current_job and self._job_matches(
                self._current_job, filename=filename, job_id=job_id
            ):
                self._current_job["cancel_event"].set()
                self._current_job["cancel_requested_at"] = time.time()
                current_cancelled = self._serialize_job(self._current_job)

            snapshot = self._publish_snapshot_locked()

        for job in removed:
            self._emit(
                {
                    "type": "INGEST_CANCELLED",
                    "job": self._serialize_job(job),
                    "data": snapshot,
                }
            )

        return {
            "status": (
                "cancel_requested"
                if current_cancelled
                else "cancelled"
                if removed
                else "idle"
            ),
            "cancelled_jobs": [self._serialize_job(job) for job in removed],
            "current_job": current_cancelled,
            "queue": snapshot,
        }

    def _resolve_job_target(
        self, job: Dict[str, Any]
    ) -> Tuple[str, str, Dict[str, Any]]:
        if job["kind"] == "local":
            return job["filename"], job["file_path"], dict(job["metadata"])

        self._update_job_progress(job, {"phase": "downloading", "percent": 12})
        if job["kind"] == "gutenberg":
            filename = download_book(
                job["source_id"], job["title"], job["preferred_format"] or "epub"
            )
        elif job["kind"] == "internet_archive":
            filename = download_ia_item(
                job["source_id"], job["title"], job["preferred_format"] or "epub"
            )
        else:
            raise RuntimeError(f"Unknown ingest job kind: {job['kind']}")

        file_path = os.path.join(LIBRARY_DIR, filename)
        metadata = dict(job["metadata"])
        metadata["filename"] = filename
        metadata.setdefault("title", job["title"])

        with self._lock:
            job["downloaded_filename"] = filename
            job["filename"] = filename

        self._emit({"type": "DOWNLOAD_COMPLETE", "filename": filename, "id": job["source_id"]})
        self._update_job_progress(job, {"phase": "downloaded", "percent": 20})
        return filename, file_path, metadata

    def _mark_job_terminal(
        self, job: Dict[str, Any], status: str, error: Optional[str] = None
    ) -> Dict[str, Any]:
        with self._lock:
            job["status"] = status
            job["phase"] = status
            job["progress"] = 100 if status == "complete" else job.get("progress", 0)
            job["completed_at"] = time.time()
            job["error"] = error
            job["cancel_requested_at"] = None
            if self._current_job and self._current_job.get("job_id") == job["job_id"]:
                self._current_job = None
            snapshot = self._publish_snapshot_locked()
        return snapshot

    def _update_job_progress(self, job: Dict[str, Any], payload: Dict[str, Any]):
        with self._lock:
            job["phase"] = payload.get("phase", job.get("phase"))
            if payload.get("percent") is not None:
                job["progress"] = int(payload["percent"])
            if "chunk_total" in payload:
                job["chunk_total"] = payload["chunk_total"]
            if "embedded_chunks" in payload:
                job["embedded_chunks"] = payload["embedded_chunks"]
            snapshot = self._publish_snapshot_locked()

        self._emit(
            {
                "type": "INGEST_PROGRESS",
                "job": self._serialize_job(job),
                "data": snapshot,
            }
        )
        return snapshot

    def _execute_job(self, job: Dict[str, Any]):
        with self._lock:
            self._current_job = job
            job["status"] = "running"
            job["phase"] = "starting"
            job["progress"] = 2
            job["started_at"] = time.time()
            snapshot = self._publish_snapshot_locked()

        self._emit(
            {
                "type": "INGEST_STARTED",
                "job": self._serialize_job(job),
                "data": snapshot,
            }
        )
        self._emit(
            {
                "status": "ingesting",
                "filename": job.get("filename") or job.get("title"),
                "job_id": job["job_id"],
            }
        )

        try:
            runtime_manager.require_roles_ready(["embedding"])
            if job["cancel_event"].is_set():
                raise IngestCancelledError("Ingestion cancelled.")

            self._update_job_progress(job, {"phase": "preparing", "percent": 5})
            filename, file_path, metadata = self._resolve_job_target(job)

            if job["cancel_event"].is_set():
                raise IngestCancelledError("Ingestion cancelled.")

            process_book_task(
                file_path,
                metadata,
                cancel_event=job["cancel_event"],
                progress_callback=lambda payload: self._update_job_progress(job, payload),
            )
            snapshot = self._mark_job_terminal(job, "complete")
            self._emit(
                {
                    "status": "complete",
                    "filename": filename,
                    "job_id": job["job_id"],
                }
            )
            self._emit(
                {
                    "type": "INGEST_COMPLETE",
                    "job": self._serialize_job(job),
                    "data": snapshot,
                }
            )
        except IngestCancelledError:
            snapshot = self._mark_job_terminal(job, "cancelled")
            self._emit(
                {
                    "type": "INGEST_CANCELLED",
                    "job": self._serialize_job(job),
                    "data": snapshot,
                }
            )
        except RuntimeNotReadyError as error:
            snapshot = self._mark_job_terminal(job, "error", str(error))
            self._emit(
                {
                    "status": "error",
                    "filename": job.get("filename") or job.get("title"),
                    "message": str(error),
                }
            )
            self._emit(
                {
                    "type": "INGEST_ERROR",
                    "job": self._serialize_job(job),
                    "data": snapshot,
                }
            )
        except Exception as error:
            logger.error(f"Ingest job failed for {job.get('filename')}: {error}")
            snapshot = self._mark_job_terminal(job, "error", str(error))
            self._emit(
                {
                    "status": "error",
                    "filename": job.get("filename") or job.get("title"),
                    "message": str(error),
                }
            )
            self._emit(
                {
                    "type": "INGEST_ERROR",
                    "job": self._serialize_job(job),
                    "data": snapshot,
                }
            )

    def _worker_loop(self):
        while not self._stop_event.is_set():
            self._wake_event.wait(0.5)
            if self._stop_event.is_set():
                break

            next_job = None
            with self._lock:
                if self._queue:
                    next_job = self._queue.popleft()
                else:
                    self._wake_event.clear()

            if next_job is None:
                continue

            if next_job["cancel_event"].is_set():
                self._mark_job_terminal(next_job, "cancelled")
                continue

            self._execute_job(next_job)

    def shutdown(self):
        self._stop_event.set()
        self._wake_event.set()
        with self._lock:
            if self._current_job:
                self._current_job["cancel_event"].set()
            for job in self._queue:
                job["cancel_event"].set()
            self._queue.clear()
        self._worker.join(timeout=3)


ingest_queue_manager = IngestQueueManager()
