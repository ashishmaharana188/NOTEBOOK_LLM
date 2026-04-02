import json
import logging
import os
import re
import threading
import zipfile
import xml.etree.ElementTree as ET
from bisect import bisect_right
from typing import Any, Callable

import ebooklib
import fitz
from bs4 import BeautifulSoup
from ebooklib import epub

from scripts.parsers import clean_text


logger = logging.getLogger(__name__)
READER_MANIFEST_VERSION = 4


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


def _resolve_epub_section_label(item_name: str, soup: BeautifulSoup) -> str:
    for selector in ("title", "h1", "h2", "h3"):
        candidate = soup.find(selector)
        if not candidate:
            continue
        text = clean_text(candidate.get_text(separator=" "))
        if text:
            return text[:140]

    fallback = os.path.splitext(os.path.basename(item_name))[0]
    fallback = re.sub(r"[_-]+", " ", fallback).strip()
    fallback = re.sub(r"\s+", " ", fallback)
    return fallback[:140] or item_name


def _normalize_epub_href(href: str) -> str:
    normalized = str(href or "").strip().split("#")[0].strip()
    normalized = normalized.replace("\\", "/").lstrip("./")
    return normalized


def _sanitize_cache_text(text: str) -> str:
    raw = str(text or "").replace("\x00", "")
    if not raw:
        return ""
    return "".join(ch for ch in raw if not 0xD800 <= ord(ch) <= 0xDFFF)


def _extract_epub_block_text(soup: BeautifulSoup) -> str:
    for tag_name in ("script", "style", "noscript"):
        for tag in soup.find_all(tag_name):
            tag.decompose()

    block_selectors = (
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "blockquote",
        "li",
        "pre",
    )
    blocks: list[str] = []
    for node in soup.find_all(block_selectors):
        text = clean_text(node.get_text(separator=" "))
        if text:
            blocks.append(text)

    if blocks:
        return _sanitize_cache_text("\n\n".join(blocks))

    return _sanitize_cache_text(clean_text(soup.get_text(separator="\n\n")))


def _resolve_epub_archive_path(opf_path: str, href: str) -> str:
    normalized_href = _normalize_epub_href(href)
    if not normalized_href:
        return ""
    opf_dir = os.path.dirname(opf_path).replace("\\", "/").strip("/")
    if not opf_dir:
        return normalized_href
    return f"{opf_dir}/{normalized_href}".replace("//", "/")


def _extract_epub_archive_order(
    archive: zipfile.ZipFile,
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    manifest_items: dict[str, dict[str, str]] = {}
    toc_rows: list[dict[str, Any]] = []
    opf_path = "OEBPS/content.opf"

    try:
        container_root = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container_root.find(".//{*}rootfile")
        if rootfile is not None and rootfile.attrib.get("full-path"):
            opf_path = rootfile.attrib["full-path"]
    except Exception:
        pass

    opf_root = ET.fromstring(archive.read(opf_path))
    manifest_node = opf_root.find(".//{*}manifest")
    if manifest_node is not None:
        for item in manifest_node.findall("{*}item"):
            item_id = str(item.attrib.get("id") or "").strip()
            href = str(item.attrib.get("href") or "").strip()
            if not item_id or not href:
                continue
            manifest_items[item_id] = {
                "href": _normalize_epub_href(href),
                "archive_path": _resolve_epub_archive_path(opf_path, href),
                "media_type": str(item.attrib.get("media-type") or "").strip().lower(),
            }

    spine_node = opf_root.find(".//{*}spine")
    spine_entries: list[dict[str, str]] = []
    toc_id = str(spine_node.attrib.get("toc") or "").strip() if spine_node is not None else ""

    if toc_id:
        ncx_item = manifest_items.get(toc_id)
        if ncx_item and ncx_item.get("archive_path"):
            try:
                ncx_root = ET.fromstring(archive.read(ncx_item["archive_path"]))

                def walk_navpoints(node: ET.Element, level: int = 1):
                    for navpoint in node.findall("{*}navPoint"):
                        label = "".join(
                            text.strip()
                            for text in navpoint.findall(".//{*}text")
                            if str(text.text or "").strip()
                        ).strip()
                        content = navpoint.find("{*}content")
                        href = _normalize_epub_href(content.attrib.get("src") or "") if content is not None else ""
                        if href or label:
                            toc_rows.append(
                                {
                                    "label": label or href or f"Section {len(toc_rows) + 1}",
                                    "level": level,
                                    "href": href,
                                }
                            )
                        walk_navpoints(navpoint, level + 1)

                walk_navpoints(ncx_root)
            except Exception:
                logger.warning("Skipping EPUB NCX parse for archive order extraction")

    archive_names = set(archive.namelist())
    if spine_node is not None:
        for itemref in spine_node.findall("{*}itemref"):
            item_id = str(itemref.attrib.get("idref") or "").strip()
            meta = manifest_items.get(item_id)
            if not meta:
                continue
            media_type = meta.get("media_type", "")
            archive_path = meta.get("archive_path", "")
            if media_type not in {"application/xhtml+xml", "text/html"}:
                continue
            if archive_path not in archive_names:
                continue
            spine_entries.append(
                {
                    "item_name": meta.get("href", "") or archive_path,
                    "archive_path": archive_path,
                }
            )

    return spine_entries, toc_rows


def _extract_epub_toc_rows(items: Any, level: int = 1) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in items or []:
        if isinstance(item, (tuple, list)):
            head = item[0] if item else None
            children = []
            if len(item) > 1:
                second = item[1]
                if isinstance(second, (tuple, list)):
                    children = list(second)
                else:
                    children = list(item[1:])
            rows.extend(_extract_epub_toc_rows([head], level))
            rows.extend(_extract_epub_toc_rows(children, level + 1))
            continue

        href = _normalize_epub_href(getattr(item, "href", ""))
        label = clean_text(str(getattr(item, "title", "") or "").strip())
        if href or label:
            rows.append(
                {
                    "label": label or href or f"Section {len(rows) + 1}",
                    "level": level,
                    "href": href,
                }
            )
    return rows


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
        elif manifest and int(manifest.get("manifest_version") or 0) != READER_MANIFEST_VERSION:
            should_build = True
        elif manifest:
            content_meta = manifest.get("content_meta") or {}
            cache_path = str(content_meta.get("cache_path") or "").strip()
            missing_cache = bool(cache_path) and (
                not os.path.exists(cache_path) or os.path.getsize(cache_path) <= 0
            )
            missing_section_support = (
                identity["format"] in {"epub", "txt", "md"}
                and not content_meta.get("supports_section_content")
            )
            missing_char_count = (
                identity["format"] in {"epub", "txt", "md"}
                and int(content_meta.get("char_count") or 0) <= 0
            )
            missing_epub_section_index = (
                identity["format"] == "epub"
                and not (manifest.get("section_index") or [])
            )
            if (
                missing_cache
                or missing_section_support
                or missing_char_count
                or missing_epub_section_index
            ):
                should_build = True

        if should_build:
            self._schedule_build(identity, fingerprint)
            manifest = self.graph_db.get_reader_manifest(identity["filename"], identity["lid"])
            return identity, manifest, "building"

        status = manifest.get("status") if manifest else "pending"
        if status == "error":
            return identity, manifest, "error"
        if status != "ready":
            self._schedule_build(identity, fingerprint)
            return identity, manifest, "building"

        return identity, manifest, "ready"

    def _rebuild_manifest_inline(
        self, identity: dict[str, Any]
    ) -> tuple[dict[str, Any] | None, str]:
        fingerprint = compute_file_fingerprint(identity["file_path"])
        try:
            manifest = self._build_manifest(identity, fingerprint)
            stored_manifest = self.graph_db.upsert_reader_manifest(
                identity["filename"], manifest, identity["lid"]
            )
            return stored_manifest, "ready"
        except Exception as error:
            logger.exception(
                "Reader manifest inline rebuild failed for %s", identity["filename"]
            )
            error_manifest = self.graph_db.upsert_reader_manifest(
                identity["filename"],
                {
                    "manifest_version": READER_MANIFEST_VERSION,
                    "format": identity["format"],
                    "file_fingerprint": fingerprint,
                    "status": "error",
                    "content_meta": {"error": str(error)},
                },
                identity["lid"],
            )
            return error_manifest, "error"

    def get_text_sections(
        self, filename: str, section: int = 0, limit: int = 1, lid: str | None = None
    ) -> tuple[dict[str, Any], dict[str, Any] | None, list[dict[str, Any]], str]:
        identity, manifest, status = self.ensure_manifest(filename, lid)
        if status != "ready" or not manifest:
            return identity, manifest, [], status

        content_meta = manifest.get("content_meta") or {}
        if not content_meta.get("supports_section_content"):
            return identity, manifest, [], "unsupported"

        cache_path = content_meta.get("cache_path")
        if (
            not cache_path
            or not os.path.exists(cache_path)
            or os.path.getsize(cache_path) <= 0
        ):
            if identity["format"] == "epub":
                manifest, rebuild_status = self._rebuild_manifest_inline(identity)
                if rebuild_status != "ready" or not manifest:
                    return identity, manifest, [], rebuild_status
                content_meta = manifest.get("content_meta") or {}
                cache_path = content_meta.get("cache_path")
            else:
                self._schedule_build(identity, manifest.get("file_fingerprint", ""))
                return identity, manifest, [], "building"

        if not cache_path or not os.path.exists(cache_path):
            return identity, manifest, [], "error"

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
            manifest, rebuild_status = self._rebuild_manifest_inline(identity)
            if rebuild_status != "ready" or not manifest:
                return identity, manifest, [], rebuild_status
            content_meta = manifest.get("content_meta") or {}
            cache_path = content_meta.get("cache_path")
            if not cache_path or not os.path.exists(cache_path):
                return identity, manifest, [], "error"
            with open(cache_path, "r", encoding="utf-8", errors="ignore") as handle:
                full_text = handle.read()
            if not full_text.strip():
                return identity, manifest, [], "error"
            section_index = manifest.get("section_index") or section_index

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

    def get_cached_full_text(
        self, filename: str, lid: str | None = None
    ) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
        identity, manifest, status = self.ensure_manifest(filename, lid)
        if status != "ready" or not manifest:
            return identity, manifest, ""

        content_meta = manifest.get("content_meta") or {}
        cache_path = str(content_meta.get("cache_path") or "").strip()
        if not cache_path or not os.path.exists(cache_path):
            return identity, manifest, ""

        with open(cache_path, "r", encoding="utf-8", errors="ignore") as handle:
            return identity, manifest, handle.read()

    def search_book(
        self,
        filename: str,
        query: str,
        lid: str | None = None,
        limit: int = 25,
    ) -> tuple[dict[str, Any], dict[str, Any] | None, list[dict[str, Any]], str]:
        normalized_query = str(query or "").strip()
        if not normalized_query:
            identity, manifest, status = self.ensure_manifest(filename, lid)
            return identity, manifest, [], status

        identity, manifest, status = self.ensure_manifest(filename, lid)
        if status != "ready" or not manifest:
            return identity, manifest, [], status

        fmt = str(identity.get("format") or "").lower()
        safe_limit = max(1, min(int(limit or 25), 100))
        if fmt == "pdf":
            results = self._search_pdf(identity, normalized_query, safe_limit)
            return identity, manifest, results, "ready"

        _, _, full_text = self.get_cached_full_text(filename, identity.get("lid"))
        if not full_text.strip():
            return identity, manifest, [], "ready"

        section_index = list(manifest.get("section_index") or [])
        results = self._search_cached_text(
            full_text=full_text,
            query=normalized_query,
            section_index=section_index,
            limit=safe_limit,
        )
        return identity, manifest, results, "ready"

    def _search_cached_text(
        self,
        full_text: str,
        query: str,
        section_index: list[dict[str, Any]],
        limit: int,
    ) -> list[dict[str, Any]]:
        normalized_full_text = str(full_text or "")
        if not normalized_full_text:
            return []

        pattern = re.compile(re.escape(query), re.IGNORECASE)
        sections = section_index or _split_text_sections(normalized_full_text)
        section_starts = [int(row.get("start_offset") or 0) for row in sections]
        results: list[dict[str, Any]] = []

        for match_index, match in enumerate(pattern.finditer(normalized_full_text)):
            if len(results) >= limit:
                break
            start = match.start()
            end = match.end()
            section_pos = max(0, bisect_right(section_starts, start) - 1)
            section = sections[min(section_pos, len(sections) - 1)] if sections else {}
            snippet_start = max(0, start - 110)
            snippet_end = min(len(normalized_full_text), end + 150)
            snippet = normalized_full_text[snippet_start:snippet_end].strip()
            results.append(
                {
                    "result_id": f"match_{match_index}",
                    "query": query,
                    "snippet": snippet,
                    "match_start": start - snippet_start,
                    "match_end": end - snippet_start,
                    "char_index": start,
                    "section_index": int(section.get("section_index") or 0),
                    "page": int(section.get("section_index") or 0) + 1,
                    "label": str(section.get("label") or ""),
                    "href": str(section.get("href") or ""),
                    "page_label": str(section.get("label") or ""),
                }
            )
        return results

    def _search_pdf(
        self, identity: dict[str, Any], query: str, limit: int
    ) -> list[dict[str, Any]]:
        doc = fitz.open(identity["file_path"])
        try:
            pattern = re.compile(re.escape(query), re.IGNORECASE)
            results: list[dict[str, Any]] = []
            for page_index, page in enumerate(doc):
                text = clean_text(page.get_text())
                if not text:
                    continue
                for match_index, match in enumerate(pattern.finditer(text)):
                    if len(results) >= limit:
                        return results
                    start = match.start()
                    end = match.end()
                    snippet_start = max(0, start - 110)
                    snippet_end = min(len(text), end + 150)
                    snippet = text[snippet_start:snippet_end].strip()
                    results.append(
                        {
                            "result_id": f"page_{page_index + 1}_{match_index}",
                            "query": query,
                            "snippet": snippet,
                            "match_start": start - snippet_start,
                            "match_end": end - snippet_start,
                            "char_index": start,
                            "section_index": page_index,
                            "page": page_index + 1,
                            "label": f"Page {page_index + 1}",
                            "href": "",
                            "page_label": str(page_index + 1),
                        }
                    )
            return results
        finally:
            doc.close()

    def _schedule_build(self, identity: dict[str, Any], fingerprint: str):
        book_key = identity["book_key"]
        with self._build_lock:
            if book_key in self._active_builds:
                return
            self._active_builds.add(book_key)

        self.graph_db.upsert_reader_manifest(
            identity["filename"],
            {
                "manifest_version": READER_MANIFEST_VERSION,
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
                    "manifest_version": READER_MANIFEST_VERSION,
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
                "manifest_version": READER_MANIFEST_VERSION,
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
        section_index: list[dict[str, Any]] = []
        section_texts: list[str] = []
        running_offset = 0
        item_offsets: dict[str, int] = {}
        toc_rows: list[dict[str, Any]] = []
        toc_label_by_href: dict[str, str] = {}

        def append_section(
            item_name: str,
            html_bytes: bytes | str,
            preferred_label: str = "",
        ):
            nonlocal running_offset
            try:
                soup = BeautifulSoup(html_bytes, "html.parser")
            except Exception:
                return
            text = _extract_epub_block_text(soup)
            normalized_item_name = _normalize_epub_href(item_name)
            item_label = (
                clean_text(str(preferred_label or toc_label_by_href.get(normalized_item_name) or ""))
                or _resolve_epub_section_label(item_name, soup)
            )
            item_offsets[normalized_item_name] = running_offset
            if not text:
                return
            start_offset = running_offset
            end_offset = start_offset + len(text)
            section_index.append(
                {
                    "section_index": len(section_index),
                    "label": item_label,
                    "href": normalized_item_name or item_name,
                    "char_index": running_offset,
                    "start_offset": start_offset,
                    "end_offset": end_offset,
                    "char_length": len(text),
                    "preview": text[:160],
                }
            )
            section_texts.append(text)
            running_offset = end_offset + 2

        try:
            with zipfile.ZipFile(file_path, "r") as archive:
                spine_entries, archive_toc_rows = _extract_epub_archive_order(archive)
                if archive_toc_rows:
                    toc_rows = archive_toc_rows
                    toc_label_by_href = {
                        _normalize_epub_href(row.get("href")): row.get("label")
                        for row in toc_rows
                        if row.get("href") and row.get("label")
                    }
                for entry in spine_entries:
                    try:
                        append_section(
                            entry.get("item_name", ""),
                            archive.read(entry.get("archive_path", "")),
                        )
                    except Exception:
                        logger.warning(
                            "Skipping EPUB spine entry %s", entry.get("archive_path", "")
                        )
        except Exception as error:
            logger.warning("EPUB archive spine parse failed for %s: %s", identity["filename"], error)

        try:
            if not section_index or not toc_rows:
                book = epub.read_epub(file_path)
                if not toc_rows:
                    toc_rows = _extract_epub_toc_rows(book.toc)
                    toc_label_by_href = {
                        _normalize_epub_href(row.get("href")): row.get("label")
                        for row in toc_rows
                        if row.get("href") and row.get("label")
                    }
                if not section_index:
                    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                        try:
                            append_section(item.get_name(), item.get_content())
                        except Exception:
                            logger.warning("Skipping broken EPUB document item %s", item.get_name())
        except Exception as error:
            logger.warning("EPUB primary parse failed for %s: %s", identity["filename"], error)

        if not section_index:
            try:
                with zipfile.ZipFile(file_path, "r") as archive:
                    html_names = [
                        name
                        for name in archive.namelist()
                        if str(name).lower().endswith((".xhtml", ".html", ".htm"))
                    ]
                    for name in html_names:
                        try:
                            append_section(name, archive.read(name))
                        except Exception:
                            logger.warning("Skipping fallback EPUB archive entry %s", name)
            except Exception as error:
                logger.warning("EPUB archive fallback failed for %s: %s", identity["filename"], error)

        if not section_index:
            combined_text = "\n\n".join(part for part in section_texts if part).strip()
            if combined_text:
                rebuilt_sections = _split_text_sections(combined_text)
                section_index = rebuilt_sections
                section_texts = [
                    combined_text[
                        int(row.get("start_offset") or 0): int(row.get("end_offset") or 0)
                    ]
                    for row in rebuilt_sections
                ]

        toc = [
            {
                **row,
                "char_index": item_offsets.get(
                    _normalize_epub_href(str(row.get("href") or "")),
                    0,
                ),
            }
            for row in toc_rows
        ]

        if not section_index:
            raise ValueError("EPUB text extraction produced no readable sections")

        cache_path = os.path.join(
            self.cache_dir, f"{identity['book_key'].replace(':', '_')}_{fingerprint}.txt"
        )
        cache_text = _sanitize_cache_text("\n\n".join(section_texts))
        if not cache_text.strip():
            raise ValueError("EPUB cache text was empty after extraction")
        with open(cache_path, "w", encoding="utf-8", errors="ignore") as handle:
            handle.write(cache_text)
        return {
            "manifest_version": READER_MANIFEST_VERSION,
            "format": identity["format"],
            "file_fingerprint": fingerprint,
            "status": "ready",
            "toc": toc,
            "page_count": len(section_index),
            "section_index": section_index,
            "location_map": section_index,
            "content_meta": {
                "supports_section_content": True,
                "cache_path": cache_path,
                "section_count": len(section_index),
                "char_count": len(cache_text),
                "word_count": len(cache_text.split()),
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
            "manifest_version": READER_MANIFEST_VERSION,
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
