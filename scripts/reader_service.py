import json
import logging
import os
import threading
from typing import Any, Callable

import ebooklib
import fitz
from bs4 import BeautifulSoup
from ebooklib import epub

from scripts.parsers import clean_text


logger = logging.getLogger(__name__)


def compute_file_fingerprint(file_path: str) -> str:
    stat = os.stat(file_path)
    return f"{stat.st_size}:{stat.st_mtime_ns}"


def _split_text_sections(text: str, target_chars: int = 6000) -> list[dict[str, Any]]:
    normalized_text = str(text or "")
    if not normalized_text:
        return []

    paragraphs = [part.strip() for part in normalized_text.split("\n\n") if part.strip()]
    sections: list[dict[str, Any]] = []
    current_parts: list[str] = []
    current_length = 0
    start_offset = 0
    consumed = 0
    section_index = 0

    def flush_section():
        nonlocal current_parts, current_length, start_offset, section_index, consumed
        if not current_parts:
            return
        body = "\n\n".join(current_parts).strip()
        end_offset = start_offset + len(body)
        sections.append(
            {
                "section_index": section_index,
                "label": f"Section {section_index + 1}",
                "start_offset": start_offset,
                "end_offset": end_offset,
                "char_length": len(body),
                "preview": body[:160],
            }
        )
        section_index += 1
        consumed = end_offset
        start_offset = consumed + 2
        current_parts = []
        current_length = 0

    for paragraph in paragraphs:
        paragraph_len = len(paragraph) + (2 if current_parts else 0)
        if current_parts and current_length + paragraph_len > target_chars:
            flush_section()
        current_parts.append(paragraph)
        current_length += paragraph_len

    flush_section()

    if not sections:
        sections.append(
            {
                "section_index": 0,
                "label": "Section 1",
                "start_offset": 0,
                "end_offset": len(normalized_text),
                "char_length": len(normalized_text),
                "preview": normalized_text[:160],
            }
        )

    return sections


def _section_offsets_are_invalid(
    section_index: list[dict[str, Any]], text_length: int
) -> bool:
    for row in section_index:
        try:
            start_offset = int(row.get("start_offset"))
            end_offset = int(row.get("end_offset"))
        except (TypeError, ValueError):
            return True
        if start_offset < 0 or end_offset <= start_offset or end_offset > text_length:
            return True
    return False


class ReaderManifestService:
    def __init__(self, graph_db, library_dir: str, cache_dir: str):
        self.graph_db = graph_db
        self.library_dir = library_dir
        self.cache_dir = cache_dir
        self._build_lock = threading.Lock()
        self._active_builds: set[str] = set()
        self._broadcaster: Callable[[dict[str, Any]], None] | None = None
        os.makedirs(self.cache_dir, exist_ok=True)

    def set_broadcaster(self, broadcaster: Callable[[dict[str, Any]], None] | None):
        self._broadcaster = broadcaster

    def _broadcast(self, payload: dict[str, Any]):
        if self._broadcaster:
            try:
                self._broadcaster(payload)
            except Exception as error:
                logger.warning("Reader broadcast failed: %s", error)

    def _resolve_file_path(self, filename: str, resolved_path: str = "") -> str:
        if resolved_path and os.path.exists(resolved_path):
            return resolved_path
        return os.path.join(self.library_dir, filename)

    def ensure_manifest(
        self, filename: str, lid: str | None = None, force: bool = False
    ) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
        identity = self.graph_db.resolve_reader_book_identity(filename, lid)
        file_path = self._resolve_file_path(identity["filename"], identity.get("file_path", ""))
        if not os.path.exists(file_path):
            raise FileNotFoundError(file_path)

        identity["file_path"] = file_path
        fingerprint = compute_file_fingerprint(file_path)
        manifest = self.graph_db.get_reader_manifest(identity["filename"], identity["lid"])

        should_build = force or manifest is None
        if manifest and manifest.get("file_fingerprint") != fingerprint:
            should_build = True
        elif manifest:
            content_meta = manifest.get("content_meta") or {}
            cache_path = str(content_meta.get("cache_path") or "").strip()
            missing_cache = bool(cache_path) and not os.path.exists(cache_path)
            missing_section_support = (
                identity["format"] in {"epub", "txt", "md"}
                and not content_meta.get("supports_section_content")
            )
            missing_epub_section_index = (
                identity["format"] == "epub"
                and not (manifest.get("section_index") or [])
            )
            if missing_cache or missing_section_support or missing_epub_section_index:
                should_build = True

        if should_build:
            self._schedule_build(identity, fingerprint)
            manifest = self.graph_db.get_reader_manifest(identity["filename"], identity["lid"])
            return identity, manifest, "building"

        status = manifest.get("status") if manifest else "pending"
        if status != "ready":
            self._schedule_build(identity, fingerprint)
            return identity, manifest, "building"

        return identity, manifest, "ready"

    def get_text_sections(
        self, filename: str, section: int = 0, limit: int = 1, lid: str | None = None
    ) -> tuple[dict[str, Any], dict[str, Any] | None, list[dict[str, Any]], str]:
        identity, manifest, status = self.ensure_manifest(filename, lid)
        if status != "ready" or not manifest:
            return identity, manifest, [], "building"

        content_meta = manifest.get("content_meta") or {}
        if not content_meta.get("supports_section_content"):
            return identity, manifest, [], "unsupported"

        cache_path = content_meta.get("cache_path")
        if not cache_path or not os.path.exists(cache_path):
            self._schedule_build(identity, manifest.get("file_fingerprint", ""))
            return identity, manifest, [], "building"

        with open(cache_path, "r", encoding="utf-8", errors="ignore") as handle:
            full_text = handle.read()

        section_index = manifest.get("section_index") or []
        needs_rebuilt_sections = (
            not section_index
            or (
                identity["format"] == "epub"
                and (
                    any(int(row.get("char_length") or 0) <= 0 for row in section_index)
                    or _section_offsets_are_invalid(section_index, len(full_text))
                )
            )
        )
        if needs_rebuilt_sections and full_text.strip():
            rebuilt_sections = _split_text_sections(full_text)
            rebuilt_manifest = {
                **manifest,
                "page_count": len(rebuilt_sections),
                "section_index": rebuilt_sections,
                "location_map": [
                    {
                        "section_index": row["section_index"],
                        "start_offset": row["start_offset"],
                        "end_offset": row["end_offset"],
                    }
                    for row in rebuilt_sections
                ],
                "content_meta": {
                    **content_meta,
                    "supports_section_content": True,
                    "section_count": len(rebuilt_sections),
                    "char_count": len(full_text),
                    "word_count": len(full_text.split()),
                },
            }
            self.graph_db.upsert_reader_manifest(
                identity["filename"], rebuilt_manifest, identity["lid"]
            )
            manifest = rebuilt_manifest
            section_index = rebuilt_sections

        if identity["format"] == "epub" and not full_text.strip():
            self._schedule_build(identity, manifest.get("file_fingerprint", ""))
            return identity, manifest, [], "building"

        safe_limit = max(1, min(int(limit or 1), 5))
        max_section_index = max(len(section_index) - 1, 0)
        safe_start = min(max(0, int(section or 0)), max_section_index)
        slice_rows = section_index[safe_start : safe_start + safe_limit]
        payload_sections: list[dict[str, Any]] = []
        for row in slice_rows:
            start_offset = int(row.get("start_offset") or 0)
            end_offset = int(row.get("end_offset") or start_offset)
            payload_sections.append(
                {
                    **row,
                    "content": full_text[start_offset:end_offset],
                }
            )
        return identity, manifest, payload_sections, "ready"

    def _schedule_build(self, identity: dict[str, Any], fingerprint: str):
        book_key = identity["book_key"]
        with self._build_lock:
            if book_key in self._active_builds:
                return
            self._active_builds.add(book_key)

        self.graph_db.upsert_reader_manifest(
            identity["filename"],
            {
                "format": identity["format"],
                "file_fingerprint": fingerprint,
                "status": "building",
            },
            identity["lid"],
        )

        worker = threading.Thread(
            target=self._build_manifest_worker,
            args=(identity, fingerprint),
            daemon=True,
        )
        worker.start()

    def _build_manifest_worker(self, identity: dict[str, Any], fingerprint: str):
        try:
            manifest = self._build_manifest(identity, fingerprint)
            self.graph_db.upsert_reader_manifest(
                identity["filename"], manifest, identity["lid"]
            )
            self._broadcast(
                {
                    "type": "READER_MANIFEST_READY",
                    "filename": identity["filename"],
                    "lid": identity.get("lid") or "",
                    "format": identity["format"],
                }
            )
        except Exception as error:
            logger.exception("Reader manifest build failed for %s", identity["filename"])
            self.graph_db.upsert_reader_manifest(
                identity["filename"],
                {
                    "format": identity["format"],
                    "file_fingerprint": fingerprint,
                    "status": "error",
                    "content_meta": {"error": str(error)},
                },
                identity["lid"],
            )
            self._broadcast(
                {
                    "type": "READER_MANIFEST_READY",
                    "filename": identity["filename"],
                    "lid": identity.get("lid") or "",
                    "format": identity["format"],
                    "status": "error",
                    "message": str(error),
                }
            )
        finally:
            with self._build_lock:
                self._active_builds.discard(identity["book_key"])

    def _build_manifest(
        self, identity: dict[str, Any], fingerprint: str
    ) -> dict[str, Any]:
        fmt = str(identity["format"] or "").lower()
        file_path = identity["file_path"]

        if fmt == "pdf":
            return self._build_pdf_manifest(identity, fingerprint, file_path)
        if fmt == "epub":
            return self._build_epub_manifest(identity, fingerprint, file_path)
        return self._build_text_manifest(identity, fingerprint, file_path)

    def _build_pdf_manifest(
        self, identity: dict[str, Any], fingerprint: str, file_path: str
    ) -> dict[str, Any]:
        doc = fitz.open(file_path)
        try:
            page_offsets: list[dict[str, Any]] = []
            running_offset = 0
            for index, page in enumerate(doc):
                page_offsets.append(
                    {"page": index + 1, "char_index": running_offset, "label": str(index + 1)}
                )
                running_offset += len(clean_text(page.get_text())) + 2

            toc = []
            for item in doc.get_toc():
                level, title, page_num = item[0], item[1], item[2]
                char_index = 0
                if 0 < page_num <= len(page_offsets):
                    char_index = page_offsets[page_num - 1]["char_index"]
                toc.append(
                    {
                        "label": title,
                        "level": level,
                        "page": page_num,
                        "char_index": char_index,
                    }
                )

            return {
                "format": identity["format"],
                "file_fingerprint": fingerprint,
                "status": "ready",
                "toc": toc,
                "page_count": doc.page_count,
                "section_index": [],
                "location_map": page_offsets,
                "content_meta": {
                    "supports_section_content": False,
                    "page_count": doc.page_count,
                },
            }
        finally:
            doc.close()

    def _build_epub_manifest(
        self, identity: dict[str, Any], fingerprint: str, file_path: str
    ) -> dict[str, Any]:
        book = epub.read_epub(file_path)
        section_index: list[dict[str, Any]] = []
        item_offsets: dict[str, int] = {}
        section_texts: list[str] = []
        running_offset = 0

        for idx, item in enumerate(book.get_items_of_type(ebooklib.ITEM_DOCUMENT)):
            soup = BeautifulSoup(item.get_content(), "html.parser")
            text = clean_text(soup.get_text(separator="\n"))
            item_name = item.get_name()
            item_offsets[item_name] = running_offset
            if not text:
                continue
            start_offset = running_offset
            end_offset = start_offset + len(text)
            section_index.append(
                {
                    "section_index": len(section_index),
                    "label": item_name,
                    "href": item_name,
                    "char_index": running_offset,
                    "start_offset": start_offset,
                    "end_offset": end_offset,
                    "char_length": len(text),
                    "preview": text[:160],
                }
            )
            section_texts.append(text)
            running_offset = end_offset + 2

        def flatten_toc(items: Any, level: int = 1) -> list[dict[str, Any]]:
            rows: list[dict[str, Any]] = []
            for item in items:
                if isinstance(item, (tuple, list)):
                    rows.extend(flatten_toc(item[1:], level + 1))
                elif isinstance(item, epub.Link):
                    href = item.href.split("#")[0]
                    rows.append(
                        {
                            "label": item.title,
                            "level": level,
                            "href": item.href,
                            "char_index": item_offsets.get(href, 0),
                        }
                    )
            return rows

        toc = flatten_toc(book.toc)
        cache_path = os.path.join(
            self.cache_dir, f"{identity['book_key'].replace(':', '_')}_{fingerprint}.txt"
        )
        with open(cache_path, "w", encoding="utf-8") as handle:
            handle.write("\n\n".join(section_texts))
        return {
            "format": identity["format"],
            "file_fingerprint": fingerprint,
            "status": "ready",
            "toc": toc,
            "page_count": 0,
            "section_index": section_index,
            "location_map": section_index,
            "content_meta": {
                "supports_section_content": True,
                "cache_path": cache_path,
                "section_count": len(section_index),
                "char_count": sum(len(part) for part in section_texts),
                "word_count": sum(len(part.split()) for part in section_texts),
            },
        }

    def _build_text_manifest(
        self, identity: dict[str, Any], fingerprint: str, file_path: str
    ) -> dict[str, Any]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
            cleaned_text = clean_text(handle.read())

        cache_path = os.path.join(
            self.cache_dir, f"{identity['book_key'].replace(':', '_')}_{fingerprint}.txt"
        )
        with open(cache_path, "w", encoding="utf-8") as handle:
            handle.write(cleaned_text)

        sections = _split_text_sections(cleaned_text)
        location_map = [
            {
                "section_index": row["section_index"],
                "start_offset": row["start_offset"],
                "end_offset": row["end_offset"],
            }
            for row in sections
        ]

        return {
            "format": identity["format"],
            "file_fingerprint": fingerprint,
            "status": "ready",
            "toc": [
                {
                    "label": row["label"],
                    "level": 1,
                    "section_index": row["section_index"],
                    "char_index": row["start_offset"],
                }
                for row in sections
            ],
            "page_count": len(sections),
            "section_index": sections,
            "location_map": location_map,
            "content_meta": {
                "supports_section_content": True,
                "cache_path": cache_path,
                "section_count": len(sections),
                "char_count": len(cleaned_text),
                "word_count": len(cleaned_text.split()),
            },
        }
